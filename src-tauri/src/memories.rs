use crate::error::CommandError;
use crate::state::AppState;
use serde::{Deserialize, Serialize};
use sqlx::{Row, SqlitePool};
use std::io::{BufRead, BufReader};
use std::path::{Path, PathBuf};
use std::process::Command;
use std::time::{SystemTime, UNIX_EPOCH};
use tauri::State;

#[derive(Serialize)]
pub struct Memory {
    pub id: i64,
    pub fact: String,
    pub task_type: String,
    pub capabilities: Vec<String>,
    pub retries: u32,
    pub confidence: f64,
    pub created_at: i64,
}

fn project_id(state: &State<'_, AppState>, label: &str) -> Option<i64> {
    state.open.lock().unwrap().get(label).map(|p| p.id)
}

fn row_to_memory(row: &sqlx::sqlite::SqliteRow) -> Memory {
    let caps: String = row.get("capabilities");
    Memory {
        id: row.get("id"),
        fact: row.get("fact"),
        task_type: row.get("task_type"),
        capabilities: serde_json::from_str(&caps).unwrap_or_default(),
        retries: row.get::<i64, _>("retries") as u32,
        confidence: row.get("confidence"),
        created_at: row.get("created_at"),
    }
}

#[tauri::command]
pub async fn list_memories(
    window: tauri::Window,
    state: State<'_, AppState>,
) -> Result<Vec<Memory>, CommandError> {
    let pid = match project_id(&state, window.label()) {
        Some(i) => i,
        None => return Ok(vec![]),
    };
    let rows = sqlx::query(
        "SELECT id, fact, task_type, capabilities, retries, confidence, created_at
         FROM memories
         WHERE project_id = ?1
         ORDER BY created_at DESC",
    )
    .bind(pid)
    .fetch_all(&state.db)
    .await?;
    Ok(rows.iter().map(row_to_memory).collect())
}

#[tauri::command]
pub async fn add_memory(
    window: tauri::Window,
    state: State<'_, AppState>,
    fact: String,
    task_type: String,
    capabilities: Vec<String>,
    confidence: f64,
) -> Result<Memory, CommandError> {
    let pid = project_id(&state, window.label()).ok_or(CommandError::NoProject)?;
    let fact = fact.trim().to_owned();
    let caps = serde_json::to_string(&capabilities).map_err(|e| CommandError::Db(e.to_string()))?;
    let confidence = confidence.clamp(0.0, 1.0);
    let created_at = SystemTime::now()
        .duration_since(UNIX_EPOCH)
        .unwrap_or_default()
        .as_millis() as i64;

    let id = sqlx::query(
        "INSERT INTO memories (project_id, fact, task_type, capabilities, retries, confidence, created_at)
         VALUES (?1, ?2, ?3, ?4, 0, ?5, ?6)",
    )
    .bind(pid)
    .bind(&fact)
    .bind(&task_type)
    .bind(&caps)
    .bind(confidence)
    .bind(created_at)
    .execute(&state.db)
    .await?
    .last_insert_rowid();

    Ok(Memory {
        id,
        fact,
        task_type,
        capabilities,
        retries: 0,
        confidence,
        created_at,
    })
}

#[tauri::command]
pub async fn update_memory(
    window: tauri::Window,
    state: State<'_, AppState>,
    id: i64,
    fact: String,
    confidence: f64,
) -> Result<(), CommandError> {
    let pid = project_id(&state, window.label()).ok_or(CommandError::NoProject)?;
    sqlx::query("UPDATE memories SET fact = ?1, confidence = ?2 WHERE id = ?3 AND project_id = ?4")
        .bind(fact.trim())
        .bind(confidence.clamp(0.0, 1.0))
        .bind(id)
        .bind(pid)
        .execute(&state.db)
        .await?;
    Ok(())
}

#[tauri::command]
pub async fn delete_memory(
    window: tauri::Window,
    state: State<'_, AppState>,
    id: i64,
) -> Result<(), CommandError> {
    let pid = project_id(&state, window.label()).ok_or(CommandError::NoProject)?;
    sqlx::query("DELETE FROM memories WHERE id = ?1 AND project_id = ?2")
        .bind(id)
        .bind(pid)
        .execute(&state.db)
        .await?;
    Ok(())
}

/// Relevance retrieval: the top learned memories for a task, ranked by FTS5/BM25.
/// Degrades to none if FTS5 is unavailable or nothing matches.
pub async fn relevant_memories(
    db: &SqlitePool,
    project_id: i64,
    query: &str,
    limit: i64,
) -> Vec<Memory> {
    let match_query = fts_query(query);
    if match_query.is_empty() {
        return vec![];
    }
    let rows = sqlx::query(
        "SELECT m.id, m.fact, m.task_type, m.capabilities, m.retries, m.confidence, m.created_at
         FROM memories_fts
         JOIN memories m ON m.id = memories_fts.rowid
         WHERE m.project_id = ?1 AND memories_fts MATCH ?2
         ORDER BY bm25(memories_fts) LIMIT ?3",
    )
    .bind(project_id)
    .bind(&match_query)
    .bind(limit)
    .fetch_all(db)
    .await;
    match rows {
        Ok(rows) => rows.iter().map(row_to_memory).collect(),
        Err(_) => vec![],
    }
}

#[derive(Deserialize)]
struct Distilled {
    action: String,
    #[serde(default)]
    id: Option<i64>,
    #[serde(default)]
    fact: Option<String>,
    #[serde(default)]
    task_type: Option<String>,
    #[serde(default)]
    confidence: Option<f64>,
}

/// Distill a durable, codebase-specific lesson from a completed run's transcript,
/// reconciled against existing memories: read the newest `~/.claude` JSONL for the
/// project, ask Claude to extract/refine one quirk (or skip), and store it.
#[tauri::command]
pub async fn distill_memory(
    window: tauri::Window,
    state: State<'_, AppState>,
    goal: String,
) -> Result<Option<Memory>, CommandError> {
    let (pid, root) = match state
        .open
        .lock()
        .unwrap()
        .get(window.label())
        .map(|p| (p.id, p.root.clone()))
    {
        Some(v) => v,
        None => return Ok(None),
    };
    let digest = match run_digest(&root) {
        Some(d) => d,
        None => return Ok(None),
    };
    let neighbours = relevant_memories(&state.db, pid, &goal, 6).await;
    let prompt = build_distill_prompt(&goal, &digest, &neighbours);
    let claude = crate::planner::locate_claude();
    let distilled = tauri::async_runtime::spawn_blocking(move || run_distill(claude, root, prompt))
        .await
        .map_err(|e| CommandError::Db(format!("distill failed: {e}")))??;

    let fact = distilled.fact.unwrap_or_default().trim().to_owned();
    let confidence = distilled.confidence.unwrap_or(0.7).clamp(0.0, 1.0);
    let now = SystemTime::now()
        .duration_since(UNIX_EPOCH)
        .unwrap_or_default()
        .as_millis() as i64;

    match distilled.action.as_str() {
        "new" if !fact.is_empty() => {
            let task_type = distilled.task_type.unwrap_or_default();
            let id = sqlx::query(
                "INSERT INTO memories (project_id, fact, task_type, capabilities, retries, confidence, created_at)
                 VALUES (?1, ?2, ?3, '[]', 0, ?4, ?5)",
            )
            .bind(pid)
            .bind(&fact)
            .bind(&task_type)
            .bind(confidence)
            .bind(now)
            .execute(&state.db)
            .await?
            .last_insert_rowid();
            Ok(Some(Memory {
                id,
                fact,
                task_type,
                capabilities: vec![],
                retries: 0,
                confidence,
                created_at: now,
            }))
        }
        "update" if !fact.is_empty() => {
            let Some(id) = distilled.id else {
                return Ok(None);
            };
            sqlx::query(
                "UPDATE memories SET fact = ?1, confidence = ?2 WHERE id = ?3 AND project_id = ?4",
            )
            .bind(&fact)
            .bind(confidence)
            .bind(id)
            .bind(pid)
            .execute(&state.db)
            .await?;
            let row = sqlx::query(
                "SELECT id, fact, task_type, capabilities, retries, confidence, created_at
                 FROM memories WHERE id = ?1 AND project_id = ?2",
            )
            .bind(id)
            .bind(pid)
            .fetch_optional(&state.db)
            .await?;
            Ok(row.as_ref().map(row_to_memory))
        }
        _ => Ok(None),
    }
}

/// Newest `~/.claude` session transcript for the project, flattened to its text
/// fields and capped to the tail (where the run's conclusions live).
fn run_digest(root: &Path) -> Option<String> {
    let home = std::env::var("HOME").ok()?;
    let encoded = root.to_string_lossy().replace(['/', '.'], "-");
    let dir = PathBuf::from(home)
        .join(".claude")
        .join("projects")
        .join(encoded);
    let newest = std::fs::read_dir(&dir)
        .ok()?
        .filter_map(|e| e.ok())
        .filter(|e| e.path().extension().and_then(|x| x.to_str()) == Some("jsonl"))
        .max_by_key(|e| {
            e.metadata()
                .ok()
                .and_then(|m| m.modified().ok())
                .unwrap_or(UNIX_EPOCH)
        })?
        .path();
    let f = std::fs::File::open(&newest).ok()?;
    let texts: Vec<String> = BufReader::new(f)
        .lines()
        .map_while(Result::ok)
        .filter_map(|line| crate::sessions::extract_string_field(&line, "text"))
        .collect();
    let digest = texts.join("\n");
    let count = digest.chars().count();
    let digest: String = if count > 8000 {
        digest.chars().skip(count - 8000).collect()
    } else {
        digest
    };
    (!digest.trim().is_empty()).then_some(digest)
}

fn build_distill_prompt(goal: &str, digest: &str, neighbours: &[Memory]) -> String {
    let existing = if neighbours.is_empty() {
        "(none)".to_owned()
    } else {
        neighbours
            .iter()
            .map(|m| format!("[{}] {}", m.id, m.fact))
            .collect::<Vec<_>>()
            .join("\n")
    };
    format!(
        "Distill durable, reusable engineering knowledge about THIS repository from a completed agent run.\n\n\
Task that was run: {goal}\n\n\
Existing learned facts (for dedup / refinement):\n{existing}\n\n\
Run transcript (excerpt):\n{digest}\n\n\
Extract AT MOST ONE durable, codebase-specific quirk or lesson worth recalling for similar future tasks — the kind a new engineer learns the hard way (e.g. \"the auth module's tests need AUTH_TEST_TOKEN set\", \"prefer the limiter in lib/throttle.py over writing a new one\"). \
Ignore generic advice, one-off trivia, and anything an existing fact already captures unless you can genuinely refine it. \
If it refines an existing fact, return action \"update\" with that fact's id and improved text. If nothing durable is worth recording, return action \"skip\".\n\n\
Output ONLY a raw JSON object, no prose, no code fences:\n\
{{\"action\":\"new|update|skip\",\"id\":<existing id if update>,\"fact\":\"...\",\"task_type\":\"...\",\"confidence\":0.7}}"
    )
}

fn run_distill(claude: PathBuf, cwd: PathBuf, prompt: String) -> Result<Distilled, CommandError> {
    let output = Command::new(&claude)
        .args(["-p", &prompt, "--output-format", "json"])
        .current_dir(&cwd)
        .output()
        .map_err(|e| {
            CommandError::Db(format!("failed to run claude ({}): {e}", claude.display()))
        })?;
    if !output.status.success() {
        return Err(CommandError::Db("claude distill failed".into()));
    }
    let stdout = String::from_utf8_lossy(&output.stdout);
    let envelope: serde_json::Value =
        serde_json::from_str(stdout.trim()).map_err(|e| CommandError::Db(e.to_string()))?;
    let reply = envelope.get("result").unwrap_or(&envelope);
    let value = match reply.as_str() {
        Some(s) => crate::planner::parse_loose_object(s)
            .ok_or_else(|| CommandError::Db("could not parse distilled memory".into()))?,
        None => reply.clone(),
    };
    serde_json::from_value::<Distilled>(value).map_err(|e| CommandError::Db(e.to_string()))
}

/// Build an FTS5 MATCH query from free text: alphanumeric tokens, each quoted so
/// FTS operator words (and/or/not/near) can't break the syntax, OR-joined.
fn fts_query(text: &str) -> String {
    let mut seen = std::collections::HashSet::new();
    text.to_lowercase()
        .split(|c: char| !c.is_ascii_alphanumeric())
        .filter(|t| t.len() > 2 && seen.insert(t.to_string()))
        .take(20)
        .map(|t| format!("\"{t}\""))
        .collect::<Vec<_>>()
        .join(" OR ")
}
