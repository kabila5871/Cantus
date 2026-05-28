use crate::error::CommandError;
use crate::pty;
use crate::state::{AppState, OpenProject};
use crate::watcher;
use serde::Serialize;
use sha2::{Digest, Sha256};
use std::path::{Path, PathBuf};
use tauri::{AppHandle, State};

// ── Shared types ──────────────────────────────────────────────────────────────

#[derive(Serialize)]
pub struct AppInfo {
    pub name: String,
    pub version: String,
}

#[derive(Serialize)]
pub struct Project {
    pub id: i64,
    pub root_path: String,
}

#[derive(Serialize)]
pub struct DirEntry {
    pub name: String,
    pub path: String,
    pub is_dir: bool,
}

#[derive(Serialize)]
pub struct FileContent {
    pub content: String,
    pub content_hash: String,
}

#[derive(Serialize)]
pub struct FileEntry {
    pub path: String,
    pub content_hash: String,
    pub updated_at: String,
}

// ── Helpers ───────────────────────────────────────────────────────────────────

pub fn hash_hex(bytes: &[u8]) -> String {
    format!("{:x}", Sha256::digest(bytes))
}

/// Resolve a project-relative path, rejecting escapes (path traversal).
/// Pass `must_exist = false` for writes, where the leaf may not exist yet —
/// the parent is canonicalized so traversal is still caught.
fn resolve_scoped(root: &Path, rel: &str, must_exist: bool) -> Result<PathBuf, CommandError> {
    let rel = rel.trim_matches('/');
    let joined = if rel.is_empty() || rel == "." {
        root.to_path_buf()
    } else {
        root.join(rel)
    };
    let canonical = match joined.canonicalize() {
        Ok(c) => c,
        Err(_) if !must_exist => {
            let parent = joined
                .parent()
                .ok_or(CommandError::Forbidden(rel.to_owned()))?;
            let name = joined
                .file_name()
                .ok_or(CommandError::Forbidden(rel.to_owned()))?;
            parent
                .canonicalize()
                .map_err(|_| CommandError::NotFound(rel.to_owned()))?
                .join(name)
        }
        Err(_) => return Err(CommandError::NotFound(rel.to_owned())),
    };
    if !canonical.starts_with(root) {
        return Err(CommandError::Forbidden(rel.to_owned()));
    }
    Ok(canonical)
}

fn now_iso() -> String {
    // std-only RFC-3339-ish timestamp; no chrono dep for a single string.
    let secs = std::time::SystemTime::now()
        .duration_since(std::time::UNIX_EPOCH)
        .unwrap_or_default()
        .as_secs();
    // Format as UTC seconds — good enough for created_at/updated_at storage.
    format!("{secs}")
}

// ── Commands ──────────────────────────────────────────────────────────────────

#[tauri::command]
pub fn app_info(app: AppHandle) -> AppInfo {
    let pkg = app.package_info();
    AppInfo {
        name: pkg.name.clone(),
        version: pkg.version.to_string(),
    }
}

#[tauri::command]
pub async fn open_project(
    state: State<'_, AppState>,
    app: AppHandle,
    path: String,
) -> Result<Project, CommandError> {
    let canonical = Path::new(&path)
        .canonicalize()
        .map_err(|_| CommandError::NotFound(path.clone()))?;
    if !canonical.is_dir() {
        return Err(CommandError::NotFound(path));
    }
    let root_str = canonical.to_string_lossy().into_owned();

    let id: i64 = sqlx::query_scalar(
        "INSERT INTO projects (root_path, created_at)
         VALUES (?1, ?2)
         ON CONFLICT(root_path) DO UPDATE SET root_path = root_path
         RETURNING id",
    )
    .bind(&root_str)
    .bind(now_iso())
    .fetch_one(&state.db)
    .await?;

    let watcher =
        watcher::start(canonical.clone(), app).map_err(|e| CommandError::Io(e.to_string()))?;

    *state.open.lock().unwrap() = Some(OpenProject {
        id,
        root: canonical,
        _watcher: watcher,
    });

    Ok(Project {
        id,
        root_path: root_str,
    })
}

#[tauri::command]
pub fn current_project(state: State<'_, AppState>) -> Option<Project> {
    state.open.lock().unwrap().as_ref().map(|p| Project {
        id: p.id,
        root_path: p.root.to_string_lossy().into_owned(),
    })
}

#[tauri::command]
pub fn read_dir(state: State<'_, AppState>, path: String) -> Result<Vec<DirEntry>, CommandError> {
    let guard = state.open.lock().unwrap();
    let open = guard.as_ref().ok_or(CommandError::NoProject)?;
    let target = resolve_scoped(&open.root, &path, true)?;

    let mut entries: Vec<DirEntry> = std::fs::read_dir(&target)?
        .filter_map(|e| e.ok())
        .map(|e| {
            let is_dir = e.file_type().map(|t| t.is_dir()).unwrap_or(false);
            let abs = e.path();
            let rel = abs
                .strip_prefix(&open.root)
                .unwrap_or(&abs)
                .to_string_lossy()
                .into_owned();
            let name = e.file_name().to_string_lossy().into_owned();
            DirEntry {
                name,
                path: rel,
                is_dir,
            }
        })
        .collect();

    entries.sort_by(|a, b| b.is_dir.cmp(&a.is_dir).then(a.name.cmp(&b.name)));
    Ok(entries)
}

#[tauri::command]
pub fn read_file(state: State<'_, AppState>, path: String) -> Result<FileContent, CommandError> {
    let guard = state.open.lock().unwrap();
    let open = guard.as_ref().ok_or(CommandError::NoProject)?;
    let target = resolve_scoped(&open.root, &path, true)?;
    let bytes = std::fs::read(&target)?;
    let content = String::from_utf8(bytes.clone()).map_err(|e| CommandError::Io(e.to_string()))?;
    Ok(FileContent {
        content_hash: hash_hex(&bytes),
        content,
    })
}

#[tauri::command]
pub async fn write_file(
    state: State<'_, AppState>,
    path: String,
    content: String,
) -> Result<FileEntry, CommandError> {
    let (project_id, target, root) = {
        let guard = state.open.lock().unwrap();
        let open = guard.as_ref().ok_or(CommandError::NoProject)?;
        let target = resolve_scoped(&open.root, &path, false)?;
        (open.id, target, open.root.clone())
    };

    std::fs::write(&target, content.as_bytes())?;
    let hash = hash_hex(content.as_bytes());
    let updated_at = now_iso();

    let rel = target
        .strip_prefix(&root)
        .unwrap_or(&target)
        .to_string_lossy()
        .into_owned();

    sqlx::query(
        "INSERT INTO files (project_id, path, content_hash, updated_at)
         VALUES (?1, ?2, ?3, ?4)
         ON CONFLICT(project_id, path) DO UPDATE SET content_hash = ?3, updated_at = ?4",
    )
    .bind(project_id)
    .bind(&rel)
    .bind(&hash)
    .bind(&updated_at)
    .execute(&state.db)
    .await?;

    Ok(FileEntry {
        path: rel,
        content_hash: hash,
        updated_at,
    })
}

// ── Git commands ──────────────────────────────────────────────────────────────

#[tauri::command]
pub async fn git_status(state: State<'_, AppState>) -> Result<crate::git::GitStatus, CommandError> {
    let root = state
        .open
        .lock()
        .unwrap()
        .as_ref()
        .map(|p| p.root.clone())
        .ok_or(CommandError::NoProject)?;
    crate::git::status(&root)
}

#[tauri::command]
pub async fn git_stage(
    state: State<'_, AppState>,
    paths: Vec<String>,
) -> Result<crate::git::GitStatus, CommandError> {
    let (root, validated) = scoped_paths(&state, &paths)?;
    crate::git::stage(&root, &validated)
}

#[tauri::command]
pub async fn git_unstage(
    state: State<'_, AppState>,
    paths: Vec<String>,
) -> Result<crate::git::GitStatus, CommandError> {
    let (root, validated) = scoped_paths(&state, &paths)?;
    crate::git::unstage(&root, &validated)
}

#[tauri::command]
pub async fn git_commit(
    state: State<'_, AppState>,
    message: String,
) -> Result<crate::git::GitStatus, CommandError> {
    let root = state
        .open
        .lock()
        .unwrap()
        .as_ref()
        .map(|p| p.root.clone())
        .ok_or(CommandError::NoProject)?;
    crate::git::commit(&root, &message)
}

#[tauri::command]
pub async fn git_diff(
    state: State<'_, AppState>,
    path: String,
) -> Result<crate::git::GitDiff, CommandError> {
    let (root, rel) = {
        let guard = state.open.lock().unwrap();
        let open = guard.as_ref().ok_or(CommandError::NoProject)?;
        let abs = resolve_scoped(&open.root, &path, false)?;
        let rel = abs
            .strip_prefix(&open.root)
            .map_err(|_| CommandError::Forbidden(path.clone()))?
            .to_string_lossy()
            .replace('\\', "/");
        (open.root.clone(), rel)
    };
    crate::git::diff(&root, &rel)
}

/// Validate + resolve a slice of project-relative paths, returning the project
/// root and the validated relative strings (forward-slash, no escapes).
fn scoped_paths(
    state: &State<'_, AppState>,
    paths: &[String],
) -> Result<(std::path::PathBuf, Vec<String>), CommandError> {
    let guard = state.open.lock().unwrap();
    let open = guard.as_ref().ok_or(CommandError::NoProject)?;
    let mut validated = Vec::with_capacity(paths.len());
    for p in paths {
        let abs = resolve_scoped(&open.root, p, false)?;
        let rel = abs
            .strip_prefix(&open.root)
            .map_err(|_| CommandError::Forbidden(p.clone()))?
            .to_string_lossy()
            .replace('\\', "/");
        validated.push(rel);
    }
    Ok((open.root.clone(), validated))
}

// ── Agent commands ────────────────────────────────────────────────────────────

#[tauri::command]
pub async fn agent_start(
    state: State<'_, AppState>,
    app: AppHandle,
) -> Result<crate::agent::AgentStatus, CommandError> {
    let (project_id, cwd) = {
        let guard = state.open.lock().unwrap();
        let open = guard.as_ref().ok_or(CommandError::NoProject)?;
        (open.id, open.root.clone())
    };
    crate::agent::start(state.inner(), app, project_id, cwd)
}

#[tauri::command]
pub async fn agent_send(
    state: State<'_, AppState>,
    text: String,
    context: crate::agent::EditorContext,
) -> Result<(), CommandError> {
    crate::agent::send(&state.agent, text, context)
}

#[tauri::command]
pub async fn agent_resolve_edit(
    state: State<'_, AppState>,
    edit_id: u32,
    decision: crate::agent::EditDecision,
) -> Result<(), CommandError> {
    crate::agent::resolve_edit(&state.agent, edit_id, decision)
}

#[tauri::command]
pub async fn agent_stop(
    state: State<'_, AppState>,
) -> Result<crate::agent::AgentStatus, CommandError> {
    crate::agent::stop(&state.agent)
}

#[tauri::command]
pub async fn agent_status(
    state: State<'_, AppState>,
) -> Result<crate::agent::AgentStatus, CommandError> {
    Ok(crate::agent::status(&state.agent))
}

// ── PTY commands ──────────────────────────────────────────────────────────────

#[derive(Serialize)]
pub struct SpawnedTerminal {
    pub id: u32,
}

#[tauri::command]
pub async fn pty_spawn(
    state: State<'_, AppState>,
    app: AppHandle,
    cols: u16,
    rows: u16,
) -> Result<SpawnedTerminal, CommandError> {
    let id = pty::spawn(&state, app, cols, rows)?;
    Ok(SpawnedTerminal { id })
}

#[tauri::command]
pub async fn pty_write(
    state: State<'_, AppState>,
    id: u32,
    data: String,
) -> Result<(), CommandError> {
    pty::write(&state, id, data)
}

#[tauri::command]
pub async fn pty_resize(
    state: State<'_, AppState>,
    id: u32,
    cols: u16,
    rows: u16,
) -> Result<(), CommandError> {
    pty::resize(&state, id, cols, rows)
}

#[tauri::command]
pub async fn pty_kill(state: State<'_, AppState>, id: u32) -> Result<(), CommandError> {
    pty::kill(&state, id)
}
