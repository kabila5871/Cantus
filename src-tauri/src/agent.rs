use crate::error::CommandError;
use crate::state::AppState;
use serde::{Deserialize, Serialize};
use serde_json::Value;
use std::io::{BufRead, BufReader, Write};
use std::process::{Child, ChildStdin, Command, Stdio};
use std::sync::Mutex;
use tauri::{AppHandle, Emitter, Manager};

// ── Public types (IPC contract) ───────────────────────────────────────────────

#[derive(Debug, Serialize, Clone)]
#[serde(rename_all = "snake_case")]
pub struct AgentStatus {
    pub state: AgentLifecycle,
    pub project_id: Option<i64>,
}

#[derive(Debug, Serialize, Clone, PartialEq)]
#[serde(rename_all = "snake_case")]
pub enum AgentLifecycle {
    Running,
    Stopped,
}

/// Tagged-union emitted as `agent://event`.  The `run_id` field lets the chat
/// pane group/discard tokens from stale or replaced runs (same role as the PTY
/// `id` field).
#[derive(Debug, Serialize, Clone)]
#[serde(tag = "event", rename_all = "snake_case")]
pub enum AgentEvent {
    /// Streamed partial token from `includePartialMessages`.
    Delta { run_id: u32, text: String },
    /// Completed message (assistant or user turn).
    Message {
        run_id: u32,
        role: String,
        text: String,
    },
    /// Tool invocation for live display (read-only tools in M4).
    Tool {
        run_id: u32,
        name: String,
        input: Value,
    },
    /// Terminal SDK result message.
    Result {
        run_id: u32,
        subtype: String,
        total_cost_usd: f64,
        num_turns: u32,
    },
    /// SDK or host-level error.
    Error { run_id: u32, message: String },
    /// Lifecycle change: emitted on spawn and on host exit.
    Status { state: AgentLifecycle },
    /// Host requests the user accept/reject a proposed file edit.
    ProposeEdit {
        run_id: u32,
        edit_id: u32,
        path: String,
        new_content: String,
    },
}

/// Cursor selection in the active editor buffer. All positions are 0-based.
#[derive(Debug, Deserialize, Serialize, Clone)]
#[serde(rename_all = "snake_case")]
pub struct Selection {
    pub start_line: u32,
    pub start_col: u32,
    pub end_line: u32,
    pub end_col: u32,
    pub text: String,
}

/// A recent file edit the user made, summarized (no full body).
#[derive(Debug, Deserialize, Serialize, Clone)]
#[serde(rename_all = "snake_case")]
pub struct RecentEdit {
    pub path: String,
    pub summary: String,
}

/// Minimal editor context shipped with each prompt so the agent is
/// natively aware of what the user is looking at.
#[derive(Debug, Deserialize, Serialize, Clone)]
#[serde(rename_all = "snake_case")]
pub struct EditorContext {
    pub active_path: Option<String>,
    pub selection: Option<Selection>,
    pub recent_edits: Vec<RecentEdit>,
}

/// The user's decision on a proposed edit.
#[derive(Debug, Deserialize, Serialize, Clone)]
#[serde(rename_all = "snake_case")]
pub enum EditDecision {
    Accepted,
    Rejected,
}

// ── Internal process handle ───────────────────────────────────────────────────

pub struct AgentProcess {
    pub child: Child,
    pub stdin: ChildStdin,
    /// Generation claimed from `AppState::agent_generation` at spawn. The reader
    /// thread captures it and only self-cleans if the live process still carries
    /// it, so a stale thread can never clobber a newer process.
    pub generation: u32,
    pub project_id: i64,
}

// ── Host-script message shapes (SDK output on stdout) ────────────────────────

/// The host emits `{ run_id, type, ...rest }` for every SDK message.
/// `run_id` is the host's monotonic counter, incremented per prompt.
#[derive(Deserialize)]
struct HostMessage {
    run_id: u32,
    #[serde(rename = "type")]
    kind: String,
    #[serde(flatten)]
    rest: Value,
}

/// Normalize one LDJSON line from the host into an `AgentEvent`, or `None`
/// for unknown/internal SDK bookkeeping lines.
fn normalize(line: &str) -> Option<AgentEvent> {
    let msg: HostMessage = serde_json::from_str(line).ok()?;
    let run_id = msg.run_id;
    match msg.kind.as_str() {
        // Partial streamed token (SDKPartialAssistantMessage, includePartialMessages: true)
        "partial_assistant_message" => {
            let text = extract_content_text(&msg.rest["message"]["content"])?;
            Some(AgentEvent::Delta { run_id, text })
        }
        // Completed assistant turn (SDKAssistantMessage)
        "assistant" => {
            let text = extract_content_text(&msg.rest["message"]["content"])?;
            Some(AgentEvent::Message {
                run_id,
                role: "assistant".into(),
                text,
            })
        }
        // User echo (SDKUserMessage)
        "user" => {
            let text = extract_content_text(&msg.rest["message"]["content"])?;
            Some(AgentEvent::Message {
                run_id,
                role: "user".into(),
                text,
            })
        }
        // Tool invocation
        "tool_use" => {
            let name = msg.rest["name"].as_str()?.to_owned();
            let input = msg.rest["input"].clone();
            Some(AgentEvent::Tool {
                run_id,
                name,
                input,
            })
        }
        // Terminal result (SDKResultMessage)
        "result" => {
            let subtype = msg.rest["subtype"].as_str().unwrap_or("").to_owned();
            let total_cost_usd = msg.rest["total_cost_usd"].as_f64().unwrap_or(0.0);
            let num_turns = msg.rest["num_turns"].as_u64().unwrap_or(0) as u32;
            Some(AgentEvent::Result {
                run_id,
                subtype,
                total_cost_usd,
                num_turns,
            })
        }
        // Host-injected error (not an SDK type; added by index.mjs catch block)
        "error" => {
            let message = msg.rest["message"]
                .as_str()
                .unwrap_or("unknown error")
                .to_owned();
            Some(AgentEvent::Error { run_id, message })
        }
        // Host requests user accept/reject a file edit before the agent continues.
        "propose_edit" => {
            let edit_id = msg.rest["edit_id"].as_u64()? as u32;
            let path = msg.rest["path"].as_str()?.to_owned();
            let new_content = msg.rest["new_content"].as_str()?.to_owned();
            Some(AgentEvent::ProposeEdit {
                run_id,
                edit_id,
                path,
                new_content,
            })
        }
        // system, permission_denied, task_progress, hook_* — informational, not wired in M4.
        _ => None,
    }
}

/// Extract concatenated text from a content array (handles both full `text` blocks
/// and partial `partial_text` blocks used in streaming).
fn extract_content_text(content: &Value) -> Option<String> {
    let arr = content.as_array()?;
    let text: String = arr
        .iter()
        .filter_map(|block| {
            block
                .get("partial_text")
                .or_else(|| block.get("text"))
                .and_then(Value::as_str)
        })
        .collect();
    if text.is_empty() {
        None
    } else {
        Some(text)
    }
}

// ── Broker functions (called by command handlers) ─────────────────────────────

pub fn start(
    state: &AppState,
    app: AppHandle,
    project_id: i64,
    cwd: std::path::PathBuf,
) -> Result<AgentStatus, CommandError> {
    let mut guard = state.agent.lock().unwrap();

    // Idempotent: already running for the same project — return current status.
    if let Some(ref p) = *guard {
        if p.project_id == project_id {
            return Ok(AgentStatus {
                state: AgentLifecycle::Running,
                project_id: Some(project_id),
            });
        }
        // Different project — tear down before spawning for the new one.
        stop_inner(&mut guard);
    }

    let host_script = locate_host_script()?;
    let node = which_node()?;

    let mut child = Command::new(&node)
        .arg(&host_script)
        .current_dir(&cwd)
        .stdin(Stdio::piped())
        .stdout(Stdio::piped())
        .stderr(Stdio::null())
        .spawn()
        .map_err(|e| CommandError::Agent(format!("spawn failed: {e}")))?;

    let stdin = child
        .stdin
        .take()
        .ok_or_else(|| CommandError::Agent("failed to open stdin".into()))?;
    let stdout = child
        .stdout
        .take()
        .ok_or_else(|| CommandError::Agent("failed to open stdout".into()))?;

    let generation = state
        .agent_generation
        .fetch_add(1, std::sync::atomic::Ordering::Relaxed);

    *guard = Some(AgentProcess {
        child,
        stdin,
        generation,
        project_id,
    });

    // Reader thread: parse LDJSON from the host, normalize, emit AgentEvents.
    // run_id is owned by the host (incremented per prompt); we pass it through.
    let app_thread = app.clone();
    std::thread::spawn(move || {
        let reader = BufReader::new(stdout);
        for line in reader.lines() {
            match line {
                Ok(l) if !l.is_empty() => {
                    if let Some(event) = normalize(&l) {
                        let _ = app_thread.emit("agent://event", event);
                    }
                }
                Ok(_) => {}
                Err(_) => break,
            }
        }
        // Host stdout closed → process exited. Self-clean if still our generation.
        let state = app_thread.state::<AppState>();
        let mut g = state.agent.lock().unwrap();
        if g.as_ref().map(|p| p.generation) == Some(generation) {
            *g = None;
        }
        let _ = app_thread.emit(
            "agent://event",
            AgentEvent::Status {
                state: AgentLifecycle::Stopped,
            },
        );
    });

    let _ = app.emit(
        "agent://event",
        AgentEvent::Status {
            state: AgentLifecycle::Running,
        },
    );

    Ok(AgentStatus {
        state: AgentLifecycle::Running,
        project_id: Some(project_id),
    })
}

pub fn send(
    agent: &Mutex<Option<AgentProcess>>,
    text: String,
    context: EditorContext,
) -> Result<(), CommandError> {
    write_stdin(
        agent,
        &serde_json::json!({ "type": "prompt", "text": text, "context": context }),
    )
}

pub fn resolve_edit(
    agent: &Mutex<Option<AgentProcess>>,
    edit_id: u32,
    decision: EditDecision,
) -> Result<(), CommandError> {
    write_stdin(
        agent,
        &serde_json::json!({ "type": "resolve_edit", "edit_id": edit_id, "decision": decision }),
    )
}

fn write_stdin(
    agent: &Mutex<Option<AgentProcess>>,
    value: &serde_json::Value,
) -> Result<(), CommandError> {
    let mut guard = agent.lock().unwrap();
    let proc = guard
        .as_mut()
        .ok_or_else(|| CommandError::Agent("agent not running".into()))?;
    let mut buf = serde_json::to_vec(value).unwrap();
    buf.push(b'\n');
    proc.stdin
        .write_all(&buf)
        .map_err(|e| CommandError::Agent(format!("stdin write failed: {e}")))
}

pub fn stop(agent: &Mutex<Option<AgentProcess>>) -> Result<AgentStatus, CommandError> {
    let mut guard = agent.lock().unwrap();
    stop_inner(&mut guard);
    Ok(AgentStatus {
        state: AgentLifecycle::Stopped,
        project_id: None,
    })
}

pub fn status(agent: &Mutex<Option<AgentProcess>>) -> AgentStatus {
    let guard = agent.lock().unwrap();
    match guard.as_ref() {
        Some(p) => AgentStatus {
            state: AgentLifecycle::Running,
            project_id: Some(p.project_id),
        },
        None => AgentStatus {
            state: AgentLifecycle::Stopped,
            project_id: None,
        },
    }
}

/// Close stdin and kill the child. Called while holding the guard.
fn stop_inner(guard: &mut std::sync::MutexGuard<'_, Option<AgentProcess>>) {
    if let Some(mut proc) = guard.take() {
        // Closing stdin signals the host's readline to emit 'close', letting it
        // drain in-flight promises before we kill.
        drop(proc.stdin);
        let _ = proc.child.kill();
        let _ = proc.child.wait();
    }
}

// ── Path resolution ───────────────────────────────────────────────────────────

/// Find agent-host/index.mjs by walking up from the running binary.
/// In the signed bundle (M8), the resource_dir path takes precedence.
fn locate_host_script() -> Result<std::path::PathBuf, CommandError> {
    let mut dir = std::env::current_exe()
        .ok()
        .and_then(|p| p.parent().map(|d| d.to_path_buf()));
    while let Some(d) = dir {
        let candidate = d.join("agent-host").join("index.mjs");
        if candidate.exists() {
            return Ok(candidate);
        }
        dir = d.parent().map(|d| d.to_path_buf());
    }
    Err(CommandError::Agent(
        "agent-host/index.mjs not found — run `npm install` in agent-host/".into(),
    ))
}

/// Find the `node` binary. The macOS webview process inherits a stripped PATH,
/// so we probe common install locations after the normal PATH lookup.
fn which_node() -> Result<std::path::PathBuf, CommandError> {
    for candidate in &[
        "node",
        "/usr/local/bin/node",
        "/opt/homebrew/bin/node",
        "/usr/bin/node",
    ] {
        let path = std::path::Path::new(candidate);
        if path.is_absolute() {
            if path.exists() {
                return Ok(path.to_path_buf());
            }
        } else if let Ok(out) = Command::new("which").arg(candidate).output() {
            if out.status.success() {
                let s = String::from_utf8_lossy(&out.stdout).trim().to_owned();
                if !s.is_empty() {
                    return Ok(std::path::PathBuf::from(s));
                }
            }
        }
    }
    Err(CommandError::Agent(
        "node not found; install Node.js to use the agent".into(),
    ))
}
