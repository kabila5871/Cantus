use serde::Serialize;

/// Error returned across the IPC boundary. Serializes to `{ kind, message }`
/// so the frontend can branch on `kind`.
#[derive(Debug, thiserror::Error, Serialize)]
#[serde(rename_all = "snake_case", tag = "kind", content = "message")]
pub enum CommandError {
    #[error("not found: {0}")]
    NotFound(String),
    #[error("io error: {0}")]
    Io(String),
}

impl From<std::io::Error> for CommandError {
    fn from(e: std::io::Error) -> Self {
        Self::Io(e.to_string())
    }
}
