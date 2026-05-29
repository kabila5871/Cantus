use crate::error::CommandError;
use crate::state::AppState;
use std::path::PathBuf;
use std::process::Command;
use tauri::State;

const SCHEMA: &str = r#"{"type":"object","properties":{"tasks":{"type":"array","items":{"type":"string"}}},"required":["tasks"],"additionalProperties":false}"#;

fn cwd(state: &State<'_, AppState>) -> PathBuf {
    let guard = state.open.lock().unwrap();
    guard
        .as_ref()
        .map(|p| p.root.clone())
        .or_else(|| std::env::var("HOME").ok().map(PathBuf::from))
        .unwrap_or_else(|| PathBuf::from("/"))
}

fn build_prompt(goal: &str) -> String {
    format!(
        "Decompose the following goal into 2–6 concrete, independently-executable sub-tasks \
suitable for parallel agents working in this repository. \
Return ONLY a JSON object matching the provided schema — no prose, no markdown fences. \
Goal: {goal}"
    )
}

fn extract_tasks(stdout: &str) -> Option<Vec<String>> {
    // Primary: claude -p --output-format json wraps the model reply in
    // {"type":"result","result":"<JSON string>", ...}
    if let Ok(envelope) = serde_json::from_str::<serde_json::Value>(stdout) {
        if let Some(result_str) = envelope.get("result").and_then(|v| v.as_str()) {
            if let Some(tasks) = parse_tasks_value(result_str) {
                return Some(tasks);
            }
        }
    }

    // Fallback: stdout is already the tasks object/array.
    parse_tasks_value(stdout)
}

fn parse_tasks_value(s: &str) -> Option<Vec<String>> {
    let v: serde_json::Value = serde_json::from_str(s).ok()?;
    let arr = match &v {
        serde_json::Value::Array(a) => a.clone(),
        serde_json::Value::Object(_) => v
            .get("tasks")
            .and_then(|t| t.as_array())
            .cloned()
            .unwrap_or_default(),
        _ => return None,
    };

    let tasks: Vec<String> = arr
        .iter()
        .filter_map(|item| item.as_str())
        .map(|s| s.trim().to_owned())
        .filter(|s| !s.is_empty())
        .take(8)
        .collect();

    if tasks.is_empty() {
        None
    } else {
        Some(tasks)
    }
}

#[tauri::command]
pub fn plan_tasks(state: State<'_, AppState>, goal: String) -> Result<Vec<String>, CommandError> {
    let goal = goal.trim().to_owned();
    if goal.is_empty() {
        return Err(CommandError::Agent("goal is empty".into()));
    }

    let cwd = cwd(&state);
    let prompt = build_prompt(&goal);

    let output = Command::new("claude")
        .args([
            "-p",
            &prompt,
            "--output-format",
            "json",
            "--json-schema",
            SCHEMA,
        ])
        .current_dir(&cwd)
        .output()
        .map_err(|e| CommandError::Agent(format!("failed to run claude: {e}")))?;

    if !output.status.success() {
        let stderr = String::from_utf8_lossy(&output.stderr);
        let msg = stderr.trim().chars().take(400).collect::<String>();
        return Err(CommandError::Agent(msg));
    }

    let stdout = String::from_utf8_lossy(&output.stdout);
    extract_tasks(stdout.trim()).ok_or_else(|| {
        CommandError::Agent("could not parse a task list from Claude's response".into())
    })
}
