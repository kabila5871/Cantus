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
    let secs = std::time::SystemTime::now()
        .duration_since(std::time::UNIX_EPOCH)
        .unwrap_or_default()
        .as_secs();
    format!("{secs}")
}

/// Validate + resolve a single project-relative path against `root`, returning
/// the root and the validated relative string (forward-slash, no escapes).
fn scoped_single_path(root: &Path, path: &str) -> Result<(PathBuf, String), CommandError> {
    let abs = resolve_scoped(root, path, false)?;
    let rel = abs
        .strip_prefix(root)
        .map_err(|_| CommandError::Forbidden(path.to_owned()))?
        .to_string_lossy()
        .replace('\\', "/");
    Ok((root.to_path_buf(), rel))
}

/// Validate + resolve a slice of project-relative paths against `root`, returning
/// the root and the validated relative strings (forward-slash, no escapes).
fn scoped_paths(root: &Path, paths: &[String]) -> Result<(PathBuf, Vec<String>), CommandError> {
    let mut validated = Vec::with_capacity(paths.len());
    for p in paths {
        let abs = resolve_scoped(root, p, false)?;
        let rel = abs
            .strip_prefix(root)
            .map_err(|_| CommandError::Forbidden(p.clone()))?
            .to_string_lossy()
            .replace('\\', "/");
        validated.push(rel);
    }
    Ok((root.to_path_buf(), validated))
}

/// Look up the open project for `label`, returning its root path.
fn project_root(state: &AppState, label: &str) -> Result<PathBuf, CommandError> {
    state
        .open
        .lock()
        .unwrap()
        .get(label)
        .map(|p| p.root.clone())
        .ok_or(CommandError::NoProject)
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

pub async fn open_project_for(
    state: &AppState,
    app: &AppHandle,
    label: &str,
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

    let watcher = watcher::start(canonical.clone(), app.clone(), label.to_owned())
        .map_err(|e| CommandError::Io(e.to_string()))?;

    state.open.lock().unwrap().insert(
        label.to_owned(),
        OpenProject {
            id,
            root: canonical,
            _watcher: watcher,
        },
    );

    Ok(Project {
        id,
        root_path: root_str,
    })
}

#[tauri::command]
pub async fn open_project(
    window: tauri::Window,
    state: State<'_, AppState>,
    app: AppHandle,
    path: String,
) -> Result<Project, CommandError> {
    open_project_for(&state, &app, window.label(), path).await
}

#[tauri::command]
pub fn current_project(window: tauri::Window, state: State<'_, AppState>) -> Option<Project> {
    state
        .open
        .lock()
        .unwrap()
        .get(window.label())
        .map(|p| Project {
            id: p.id,
            root_path: p.root.to_string_lossy().into_owned(),
        })
}

#[tauri::command]
pub fn read_dir(
    window: tauri::Window,
    state: State<'_, AppState>,
    path: String,
) -> Result<Vec<DirEntry>, CommandError> {
    let guard = state.open.lock().unwrap();
    let open = guard.get(window.label()).ok_or(CommandError::NoProject)?;
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
pub fn read_file(
    window: tauri::Window,
    state: State<'_, AppState>,
    path: String,
) -> Result<FileContent, CommandError> {
    let guard = state.open.lock().unwrap();
    let open = guard.get(window.label()).ok_or(CommandError::NoProject)?;
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
    window: tauri::Window,
    state: State<'_, AppState>,
    path: String,
    content: String,
) -> Result<FileEntry, CommandError> {
    let (project_id, target, root) = {
        let guard = state.open.lock().unwrap();
        let open = guard.get(window.label()).ok_or(CommandError::NoProject)?;
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

#[tauri::command]
pub fn create_dir(
    window: tauri::Window,
    state: State<'_, AppState>,
    path: String,
) -> Result<(), CommandError> {
    let guard = state.open.lock().unwrap();
    let open = guard.get(window.label()).ok_or(CommandError::NoProject)?;
    let target = resolve_scoped(&open.root, &path, false)?;
    std::fs::create_dir_all(&target)?;
    Ok(())
}

#[tauri::command]
pub fn create_file(
    window: tauri::Window,
    state: State<'_, AppState>,
    path: String,
) -> Result<(), CommandError> {
    let guard = state.open.lock().unwrap();
    let open = guard.get(window.label()).ok_or(CommandError::NoProject)?;
    let target = resolve_scoped(&open.root, &path, false)?;
    if target.exists() {
        return Err(CommandError::Io(format!("{path} already exists")));
    }
    if let Some(parent) = target.parent() {
        std::fs::create_dir_all(parent)?;
    }
    std::fs::OpenOptions::new()
        .write(true)
        .create_new(true)
        .open(&target)?;
    Ok(())
}

#[tauri::command]
pub fn move_path(
    window: tauri::Window,
    state: State<'_, AppState>,
    from: String,
    to: String,
) -> Result<(), CommandError> {
    let guard = state.open.lock().unwrap();
    let open = guard.get(window.label()).ok_or(CommandError::NoProject)?;
    let src = resolve_scoped(&open.root, &from, true)?;
    let dst = resolve_scoped(&open.root, &to, false)?;
    if dst.exists() {
        return Err(CommandError::Io(format!("{to} already exists")));
    }
    if src.is_dir() && dst.starts_with(&src) {
        return Err(CommandError::Forbidden(format!(
            "cannot move {from} into itself"
        )));
    }
    if let Some(parent) = dst.parent() {
        std::fs::create_dir_all(parent)?;
    }
    std::fs::rename(&src, &dst)?;
    Ok(())
}

#[derive(Serialize)]
pub struct SearchHit {
    pub path: String,
    pub line: u32,
    pub column: u32,
    pub text: String,
}

#[tauri::command]
pub fn search_in_files(
    window: tauri::Window,
    state: State<'_, AppState>,
    query: String,
) -> Result<Vec<SearchHit>, CommandError> {
    let root = project_root(&state, window.label())?;

    let needle = query.trim().to_lowercase();
    if needle.is_empty() {
        return Ok(vec![]);
    }

    const MAX_HITS: usize = 500;
    const MAX_FILE_BYTES: u64 = 2_000_000;
    const SKIP_DIRS: &[&str] = &[
        "node_modules",
        "target",
        "dist",
        "build",
        ".next",
        ".venv",
        "__pycache__",
        ".git",
    ];

    let mut hits = Vec::new();
    let mut stack = vec![root.clone()];
    while let Some(dir) = stack.pop() {
        if hits.len() >= MAX_HITS {
            break;
        }
        let Ok(rd) = std::fs::read_dir(&dir) else {
            continue;
        };
        for entry in rd.flatten() {
            let name = entry.file_name().to_string_lossy().into_owned();
            let Ok(ft) = entry.file_type() else { continue };
            if ft.is_dir() {
                if name.starts_with('.') || SKIP_DIRS.contains(&name.as_str()) {
                    continue;
                }
                stack.push(entry.path());
                continue;
            }
            if !ft.is_file() {
                continue;
            }
            if entry.metadata().map(|m| m.len()).unwrap_or(0) > MAX_FILE_BYTES {
                continue;
            }
            let Ok(bytes) = std::fs::read(entry.path()) else {
                continue;
            };
            if bytes.contains(&0) {
                continue; // binary
            }
            let Ok(text) = String::from_utf8(bytes) else {
                continue;
            };
            let path = entry.path();
            let rel = path
                .strip_prefix(&root)
                .unwrap_or(&path)
                .to_string_lossy()
                .into_owned();
            for (i, line) in text.lines().enumerate() {
                if let Some(col) = line.to_lowercase().find(&needle) {
                    hits.push(SearchHit {
                        path: rel.clone(),
                        line: (i + 1) as u32,
                        column: (col + 1) as u32,
                        text: line.chars().take(400).collect(),
                    });
                    if hits.len() >= MAX_HITS {
                        break;
                    }
                }
            }
        }
    }
    Ok(hits)
}

#[tauri::command]
pub fn list_files(
    window: tauri::Window,
    state: State<'_, AppState>,
) -> Result<Vec<String>, CommandError> {
    let root = project_root(&state, window.label())?;

    const MAX_FILES: usize = 20_000;
    const SKIP_DIRS: &[&str] = &[
        "node_modules",
        "target",
        "dist",
        "build",
        ".next",
        ".venv",
        "__pycache__",
        ".git",
    ];

    let mut files = Vec::new();
    let mut stack = vec![root.clone()];
    while let Some(dir) = stack.pop() {
        if files.len() >= MAX_FILES {
            break;
        }
        let Ok(rd) = std::fs::read_dir(&dir) else {
            continue;
        };
        for entry in rd.flatten() {
            let name = entry.file_name().to_string_lossy().into_owned();
            let Ok(ft) = entry.file_type() else { continue };
            if ft.is_dir() {
                if name.starts_with('.') || SKIP_DIRS.contains(&name.as_str()) {
                    continue;
                }
                stack.push(entry.path());
            } else if ft.is_file() {
                let path = entry.path();
                files.push(
                    path.strip_prefix(&root)
                        .unwrap_or(&path)
                        .to_string_lossy()
                        .into_owned(),
                );
                if files.len() >= MAX_FILES {
                    break;
                }
            }
        }
    }
    files.sort();
    Ok(files)
}

// ── Git commands ──────────────────────────────────────────────────────────────

#[tauri::command]
pub async fn git_status(
    window: tauri::Window,
    state: State<'_, AppState>,
) -> Result<crate::git::GitStatus, CommandError> {
    let root = project_root(&state, window.label())?;
    crate::git::status(&root)
}

#[tauri::command]
pub async fn git_stage(
    window: tauri::Window,
    state: State<'_, AppState>,
    paths: Vec<String>,
) -> Result<crate::git::GitStatus, CommandError> {
    let root = project_root(&state, window.label())?;
    let (root, validated) = scoped_paths(&root, &paths)?;
    crate::git::stage(&root, &validated)
}

#[tauri::command]
pub async fn git_unstage(
    window: tauri::Window,
    state: State<'_, AppState>,
    paths: Vec<String>,
) -> Result<crate::git::GitStatus, CommandError> {
    let root = project_root(&state, window.label())?;
    let (root, validated) = scoped_paths(&root, &paths)?;
    crate::git::unstage(&root, &validated)
}

#[tauri::command]
pub async fn git_commit(
    window: tauri::Window,
    state: State<'_, AppState>,
    message: String,
) -> Result<crate::git::GitStatus, CommandError> {
    let root = project_root(&state, window.label())?;
    crate::git::commit(&root, &message)
}

#[tauri::command]
pub async fn git_diff(
    window: tauri::Window,
    state: State<'_, AppState>,
    path: String,
) -> Result<crate::git::GitDiff, CommandError> {
    let (root, rel) = {
        let guard = state.open.lock().unwrap();
        let open = guard.get(window.label()).ok_or(CommandError::NoProject)?;
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

#[tauri::command]
pub async fn git_branches(
    window: tauri::Window,
    state: State<'_, AppState>,
) -> Result<Vec<crate::git::Branch>, CommandError> {
    let root = project_root(&state, window.label())?;
    crate::git::branches(&root)
}

#[tauri::command]
pub async fn git_checkout(
    window: tauri::Window,
    state: State<'_, AppState>,
    name: String,
) -> Result<crate::git::GitStatus, CommandError> {
    let root = project_root(&state, window.label())?;
    crate::git::checkout(&root, &name)
}

#[tauri::command]
pub async fn git_create_branch(
    window: tauri::Window,
    state: State<'_, AppState>,
    name: String,
) -> Result<crate::git::GitStatus, CommandError> {
    let root = project_root(&state, window.label())?;
    crate::git::create_branch(&root, &name)
}

#[tauri::command]
pub async fn git_discard(
    window: tauri::Window,
    state: State<'_, AppState>,
    paths: Vec<String>,
) -> Result<crate::git::GitStatus, CommandError> {
    let root = project_root(&state, window.label())?;
    let (root, validated) = scoped_paths(&root, &paths)?;
    crate::git::discard(&root, &validated)
}

#[tauri::command]
pub async fn git_stage_hunk(
    window: tauri::Window,
    state: State<'_, AppState>,
    path: String,
    hunk_index: usize,
) -> Result<crate::git::GitStatus, CommandError> {
    let root = project_root(&state, window.label())?;
    let (root, rel) = scoped_single_path(&root, &path)?;
    crate::git::stage_hunk(&root, &rel, hunk_index)
}

#[tauri::command]
pub async fn git_unstage_hunk(
    window: tauri::Window,
    state: State<'_, AppState>,
    path: String,
    hunk_index: usize,
) -> Result<crate::git::GitStatus, CommandError> {
    let root = project_root(&state, window.label())?;
    let (root, rel) = scoped_single_path(&root, &path)?;
    crate::git::unstage_hunk(&root, &rel, hunk_index)
}

#[tauri::command]
pub async fn git_stage_lines(
    window: tauri::Window,
    state: State<'_, AppState>,
    path: String,
    hunk_index: usize,
    line_indices: Vec<usize>,
) -> Result<crate::git::GitStatus, CommandError> {
    let root = project_root(&state, window.label())?;
    let (root, rel) = scoped_single_path(&root, &path)?;
    crate::git::stage_lines(&root, &rel, hunk_index, &line_indices)
}

#[tauri::command]
pub async fn git_unstage_lines(
    window: tauri::Window,
    state: State<'_, AppState>,
    path: String,
    hunk_index: usize,
    line_indices: Vec<usize>,
) -> Result<crate::git::GitStatus, CommandError> {
    let root = project_root(&state, window.label())?;
    let (root, rel) = scoped_single_path(&root, &path)?;
    crate::git::unstage_lines(&root, &rel, hunk_index, &line_indices)
}

#[tauri::command]
pub async fn git_discard_hunk(
    window: tauri::Window,
    state: State<'_, AppState>,
    path: String,
    hunk_index: usize,
) -> Result<crate::git::GitStatus, CommandError> {
    let root = project_root(&state, window.label())?;
    let (root, rel) = scoped_single_path(&root, &path)?;
    crate::git::discard_hunk(&root, &rel, hunk_index)
}

#[tauri::command]
pub async fn git_discard_lines(
    window: tauri::Window,
    state: State<'_, AppState>,
    path: String,
    hunk_index: usize,
    line_indices: Vec<usize>,
) -> Result<crate::git::GitStatus, CommandError> {
    let root = project_root(&state, window.label())?;
    let (root, rel) = scoped_single_path(&root, &path)?;
    crate::git::discard_lines(&root, &rel, hunk_index, &line_indices)
}

// ── New-window command ────────────────────────────────────────────────────────

#[tauri::command]
pub async fn open_in_new_window(
    app: tauri::AppHandle,
    state: State<'_, AppState>,
    path: String,
) -> Result<(), CommandError> {
    use std::sync::atomic::Ordering;
    let n = state.next_window_id.fetch_add(1, Ordering::Relaxed);
    let label = format!("win-{n}");
    open_project_for(&state, &app, &label, path).await?;
    tauri::WebviewWindowBuilder::new(&app, &label, tauri::WebviewUrl::App("index.html".into()))
        .title("Cantus")
        .inner_size(1400.0, 900.0)
        .min_inner_size(900.0, 600.0)
        .build()
        .map_err(|e| CommandError::Io(e.to_string()))?;
    Ok(())
}

// ── PTY commands ──────────────────────────────────────────────────────────────

#[derive(Serialize)]
pub struct SpawnedTerminal {
    pub id: u32,
}

#[tauri::command]
pub async fn pty_spawn(
    window: tauri::Window,
    state: State<'_, AppState>,
    app: AppHandle,
    cols: u16,
    rows: u16,
    program: Option<String>,
    args: Option<Vec<String>>,
) -> Result<SpawnedTerminal, CommandError> {
    let id = pty::spawn(&state, app, window.label(), cols, rows, program, args)?;
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
