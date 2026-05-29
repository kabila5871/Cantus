use crate::error::CommandError;
use crate::state::AppState;
use std::path::PathBuf;
use std::process::Command;
use tauri::{AppHandle, State};

fn project_cwd(state: &State<'_, AppState>) -> PathBuf {
    let guard = state.open.lock().unwrap();
    guard
        .as_ref()
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

/// Locate the `claude` CLI. Prefer the binary the agent SDK bundles inside
/// `agent-host/node_modules` — a GUI-launched `.app` inherits only a minimal
/// PATH, so a bare `Command::new("claude")` cannot find an nvm/npm install.
/// The bundled binary is the same one the agent chat already drives. Fall back
/// to PATH only for a dev shell that has `claude` installed but no agent-host.
fn locate_claude(app: &AppHandle) -> PathBuf {
    let exe = if cfg!(windows) {
        "claude.exe"
    } else {
        "claude"
    };
    if let Some(vendor) =
        crate::agent::agent_host_dir(app).map(|d| d.join("node_modules").join("@anthropic-ai"))
    {
        if let Ok(entries) = std::fs::read_dir(&vendor) {
            for entry in entries.flatten() {
                if entry
                    .file_name()
                    .to_string_lossy()
                    .starts_with("claude-agent-sdk-")
                {
                    let bin = entry.path().join(exe);
                    if bin.exists() {
                        return bin;
                    }
                }
            }
        }
    }
    PathBuf::from("claude")
}

#[tauri::command]
pub async fn plan_tasks(
    app: AppHandle,
    state: State<'_, AppState>,
    goal: String,
) -> Result<Vec<String>, CommandError> {
    let goal = goal.trim().to_owned();
    if goal.is_empty() {
        return Err(CommandError::Agent("goal is empty".into()));
    }
    let cwd = project_cwd(&state);
    let claude = locate_claude(&app);
    // The headless `claude` call can run for tens of seconds — keep it off the
    // async runtime so other IPC commands stay responsive.
    tauri::async_runtime::spawn_blocking(move || run_plan(claude, cwd, goal))
        .await
        .map_err(|e| CommandError::Agent(format!("planning task failed: {e}")))?
}

fn run_plan(claude: PathBuf, cwd: PathBuf, goal: String) -> Result<Vec<String>, CommandError> {
    let output = Command::new(&claude)
        .args(["-p", &build_prompt(&goal), "--output-format", "json"])
        .current_dir(&cwd)
        .output()
        .map_err(|e| {
            CommandError::Agent(format!("failed to run claude ({}): {e}", claude.display()))
        })?;

    if !output.status.success() {
        let stderr = String::from_utf8_lossy(&output.stderr);
        let msg = stderr.trim().chars().take(400).collect::<String>();
        return Err(CommandError::Agent(if msg.is_empty() {
            "claude planning failed".into()
        } else {
            msg
        }));
    }

    let stdout = String::from_utf8_lossy(&output.stdout);
    extract_tasks(stdout.trim()).ok_or_else(|| {
        CommandError::Agent("could not parse a task list from Claude's response".into())
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
