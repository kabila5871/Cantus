use crate::error::CommandError;
use crate::state::AppState;
use serde::Serialize;
use std::path::Path;
use tauri::State;

#[derive(Serialize)]
pub struct AppInfo {
    pub name: String,
    pub version: String,
}

/// Product name and version. A trivial infallible command proving the typed-result path.
#[tauri::command]
pub fn app_info() -> AppInfo {
    AppInfo {
        name: "Cantus".into(),
        version: env!("CARGO_PKG_VERSION").into(),
    }
}

/// Open a local folder as the active project: validate it is a directory, store
/// its canonical path as authoritative state, and return that path.
#[tauri::command]
pub fn open_project(state: State<'_, AppState>, path: String) -> Result<String, CommandError> {
    if !Path::new(&path).is_dir() {
        return Err(CommandError::NotFound(path));
    }
    let canonical = Path::new(&path).canonicalize()?;
    let display = canonical.to_string_lossy().into_owned();
    *state.project_root.lock().unwrap() = Some(canonical);
    Ok(display)
}

/// The active project's root path, or null if none is open. The frontend mirrors this.
#[tauri::command]
pub fn project_root(state: State<'_, AppState>) -> Option<String> {
    state
        .project_root
        .lock()
        .unwrap()
        .as_ref()
        .map(|p| p.to_string_lossy().into_owned())
}
