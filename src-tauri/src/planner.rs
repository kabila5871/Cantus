use crate::error::CommandError;
use crate::state::AppState;
use std::path::PathBuf;
use std::process::Command;
use tauri::State;

fn project_cwd(state: &State<'_, AppState>, label: &str) -> PathBuf {
    let guard = state.open.lock().unwrap();
    guard
        .get(label)
        .map(|p| p.root.clone())
        .or_else(|| std::env::var("HOME").ok().map(PathBuf::from))
        .unwrap_or_else(|| PathBuf::from("/"))
}

fn build_prompt(goal: &str) -> String {
    format!(
        "Decompose this goal into 2–6 concrete, independently-executable sub-tasks \
suitable for parallel agents working in this repository. \
Output ONLY a raw JSON array of strings, e.g. [\"first task\", \"second task\"]. \
No prose, no explanation, no markdown code fences.\n\nGoal: {goal}"
    )
}

/// Locate the `claude` CLI. A GUI-launched `.app` inherits only a minimal PATH,
/// so check common install locations before falling back to PATH / bare name.
pub(crate) fn locate_claude() -> PathBuf {
    let exe = if cfg!(windows) {
        "claude.exe"
    } else {
        "claude"
    };
    for path in [
        "/opt/homebrew/bin/claude",
        "/usr/local/bin/claude",
        "/usr/bin/claude",
    ] {
        let p = std::path::Path::new(path);
        if p.exists() {
            return p.to_path_buf();
        }
    }
    // ~/.claude/local/claude  and  ~/.local/bin/claude
    if let Ok(home) = std::env::var("HOME") {
        for suffix in [".claude/local/claude", ".local/bin/claude"] {
            let p = PathBuf::from(&home).join(suffix);
            if p.exists() {
                return p;
            }
        }
    }
    if let Ok(out) = Command::new("which").arg(exe).output() {
        if out.status.success() {
            let s = String::from_utf8_lossy(&out.stdout).trim().to_owned();
            if !s.is_empty() {
                return PathBuf::from(s);
            }
        }
    }
    PathBuf::from(exe)
}

#[tauri::command]
pub async fn plan_tasks(
    window: tauri::Window,
    state: State<'_, AppState>,
    goal: String,
) -> Result<Vec<String>, CommandError> {
    let goal = goal.trim().to_owned();
    if goal.is_empty() {
        return Err(CommandError::Planner("goal is empty".into()));
    }
    let cwd = project_cwd(&state, window.label());
    let claude = locate_claude();
    // The headless `claude` call can run for tens of seconds — keep it off the
    // async runtime so other IPC commands stay responsive.
    tauri::async_runtime::spawn_blocking(move || run_plan(claude, cwd, goal))
        .await
        .map_err(|e| CommandError::Planner(format!("planning task failed: {e}")))?
}

fn run_plan(claude: PathBuf, cwd: PathBuf, goal: String) -> Result<Vec<String>, CommandError> {
    let output = Command::new(&claude)
        .args(["-p", &build_prompt(&goal), "--output-format", "json"])
        .current_dir(&cwd)
        .output()
        .map_err(|e| {
            CommandError::Planner(format!("failed to run claude ({}): {e}", claude.display()))
        })?;

    if !output.status.success() {
        let stderr = String::from_utf8_lossy(&output.stderr);
        let msg = stderr.trim().chars().take(400).collect::<String>();
        return Err(CommandError::Planner(if msg.is_empty() {
            "claude planning failed".into()
        } else {
            msg
        }));
    }

    let stdout = String::from_utf8_lossy(&output.stdout);
    extract_tasks(stdout.trim()).ok_or_else(|| {
        CommandError::Planner("could not parse a task list from Claude's response".into())
    })
}

/// `claude -p --output-format json` wraps the model's reply in `{"result": …}`.
/// We ask for a bare JSON array of strings; tolerate the reply arriving as a
/// JSON-encoded string, an embedded array, or wrapped in prose / ```json fences.
fn extract_tasks(stdout: &str) -> Option<Vec<String>> {
    let envelope: serde_json::Value = serde_json::from_str(stdout).ok()?;
    let reply = envelope.get("result").unwrap_or(&envelope);
    match reply.as_str() {
        Some(s) => tasks_from_value(&parse_loose(s)?),
        None => tasks_from_value(reply),
    }
}

/// Slice to the outermost brackets so stray prose or code fences around the
/// array don't defeat the parse.
fn parse_loose(s: &str) -> Option<serde_json::Value> {
    let slice = match (s.find('['), s.rfind(']')) {
        (Some(a), Some(b)) if a < b => &s[a..=b],
        _ => s.trim(),
    };
    serde_json::from_str(slice).ok()
}

fn tasks_from_value(v: &serde_json::Value) -> Option<Vec<String>> {
    let arr = match v {
        serde_json::Value::Array(a) => a.as_slice(),
        serde_json::Value::Object(_) => v.get("tasks")?.as_array()?.as_slice(),
        _ => return None,
    };
    let tasks: Vec<String> = arr
        .iter()
        .filter_map(|item| item.as_str())
        .map(|s| s.trim().to_owned())
        .filter(|s| !s.is_empty())
        .take(8)
        .collect();
    (!tasks.is_empty()).then_some(tasks)
}

#[derive(serde::Serialize, serde::Deserialize)]
pub struct GapItem {
    pub name: String,
    pub kind: String,
    pub status: String,
    #[serde(default)]
    pub description: String,
}

/// Capability gap-check: ask Claude which existing skills/agents to reuse and
/// which new ones to create for the goal, given the current registry.
#[tauri::command]
pub async fn gap_check(
    window: tauri::Window,
    state: State<'_, AppState>,
    goal: String,
    tasks: Vec<String>,
    skills: Vec<String>,
    agents: Vec<String>,
) -> Result<Vec<GapItem>, CommandError> {
    let goal = goal.trim().to_owned();
    if goal.is_empty() {
        return Err(CommandError::Planner("goal is empty".into()));
    }
    let cwd = project_cwd(&state, window.label());
    let claude = locate_claude();
    let pid = state.open.lock().unwrap().get(window.label()).map(|p| p.id);
    let memories = match pid {
        Some(pid) => crate::memories::relevant_memories(&state.db, pid, &goal, 6)
            .await
            .into_iter()
            .map(|m| m.fact)
            .collect(),
        None => vec![],
    };
    tauri::async_runtime::spawn_blocking(move || {
        run_gap_check(claude, cwd, goal, tasks, skills, agents, memories)
    })
    .await
    .map_err(|e| CommandError::Planner(format!("gap-check failed: {e}")))?
}

fn build_gap_prompt(
    goal: &str,
    tasks: &[String],
    skills: &[String],
    agents: &[String],
    memories: &[String],
) -> String {
    let numbered = if tasks.is_empty() {
        "(none yet)".to_owned()
    } else {
        tasks
            .iter()
            .enumerate()
            .map(|(i, t)| format!("{}. {t}", i + 1))
            .collect::<Vec<_>>()
            .join("\n")
    };
    let list = |items: &[String]| {
        if items.is_empty() {
            "(none)".to_owned()
        } else {
            items.join("\n")
        }
    };
    let learned = if memories.is_empty() {
        String::new()
    } else {
        format!(
            "\n\nLearned from past runs in this repo (hints, not gospel — weigh them):\n{}",
            memories
                .iter()
                .map(|m| format!("- {m}"))
                .collect::<Vec<_>>()
                .join("\n")
        )
    };
    format!(
        "Assess capability coverage for a coding task in this repository.\n\n\
Goal: {goal}\n\nSubtasks:\n{numbered}\n\n\
Existing skills (name: description):\n{}\n\n\
Existing agents (name: description):\n{}{learned}\n\n\
Decide which EXISTING skills/agents to reuse, and which NEW ones must be created to do this well. \
Prefer reusing or composing what already exists; only propose new capabilities for a genuine gap. \
For a reuse item use the EXACT existing name. For a new item give a short kebab-case name and a one-line description.\n\n\
Output ONLY a raw JSON object, no prose, no code fences:\n\
{{\"items\":[{{\"name\":\"code-search\",\"kind\":\"skill\",\"status\":\"reuse\",\"description\":\"why it fits\"}},{{\"name\":\"rate-limit-writer\",\"kind\":\"agent\",\"status\":\"new\",\"description\":\"what it should do\"}}]}}",
        list(skills),
        list(agents),
    )
}

fn run_gap_check(
    claude: PathBuf,
    cwd: PathBuf,
    goal: String,
    tasks: Vec<String>,
    skills: Vec<String>,
    agents: Vec<String>,
    memories: Vec<String>,
) -> Result<Vec<GapItem>, CommandError> {
    let output = Command::new(&claude)
        .args([
            "-p",
            &build_gap_prompt(&goal, &tasks, &skills, &agents, &memories),
            "--output-format",
            "json",
        ])
        .current_dir(&cwd)
        .output()
        .map_err(|e| {
            CommandError::Planner(format!("failed to run claude ({}): {e}", claude.display()))
        })?;

    if !output.status.success() {
        let stderr = String::from_utf8_lossy(&output.stderr);
        let msg = stderr.trim().chars().take(400).collect::<String>();
        return Err(CommandError::Planner(if msg.is_empty() {
            "claude gap-check failed".into()
        } else {
            msg
        }));
    }

    let stdout = String::from_utf8_lossy(&output.stdout);
    extract_gap_items(stdout.trim()).ok_or_else(|| {
        CommandError::Planner("could not parse a gap-check from Claude's response".into())
    })
}

fn extract_gap_items(stdout: &str) -> Option<Vec<GapItem>> {
    let envelope: serde_json::Value = serde_json::from_str(stdout).ok()?;
    let reply = envelope.get("result").unwrap_or(&envelope);
    let value = match reply.as_str() {
        Some(s) => parse_loose_object(s)?,
        None => reply.clone(),
    };
    let items = value
        .get("items")?
        .as_array()?
        .iter()
        .filter_map(|v| serde_json::from_value::<GapItem>(v.clone()).ok())
        .filter(|it| {
            (it.kind == "skill" || it.kind == "agent")
                && (it.status == "reuse" || it.status == "new")
                && !it.name.trim().is_empty()
        })
        .take(16)
        .collect();
    Some(items)
}

/// Slice to the outermost braces so stray prose or code fences around the object
/// don't defeat the parse.
pub(crate) fn parse_loose_object(s: &str) -> Option<serde_json::Value> {
    let slice = match (s.find('{'), s.rfind('}')) {
        (Some(a), Some(b)) if a < b => &s[a..=b],
        _ => s.trim(),
    };
    serde_json::from_str(slice).ok()
}
