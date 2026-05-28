use std::path::PathBuf;
use std::sync::Mutex;

/// Backend-authoritative application state. Grows per feature; for now it holds
/// the open project's root directory.
#[derive(Default)]
pub struct AppState {
    pub project_root: Mutex<Option<PathBuf>>,
}
