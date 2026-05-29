use crate::error::CommandError;
use crate::state::AppState;
use serde::Serialize;
use std::time::{SystemTime, UNIX_EPOCH};
use tauri::State;

#[derive(Serialize)]
pub struct CapabilityStat {
    pub name: String,
    pub kind: String,
    pub uses: u32,
    pub successes: u32,
}

#[tauri::command]
pub async fn list_capability_stats(
    window: tauri::Window,
    state: State<'_, AppState>,
) -> Result<Vec<CapabilityStat>, CommandError> {
    let project_id = {
        let guard = state.open.lock().unwrap();
        match guard.get(window.label()) {
            Some(p) => p.id,
            None => return Ok(vec![]),
        }
    };

    let rows = sqlx::query(
        "SELECT name, kind, uses, successes
         FROM capability_stats
         WHERE project_id = ?1",
    )
    .bind(project_id)
    .fetch_all(&state.db)
    .await?;

    use sqlx::Row;
    Ok(rows
        .into_iter()
        .map(|row| CapabilityStat {
            name: row.get("name"),
            kind: row.get("kind"),
            uses: row.get::<i64, _>("uses") as u32,
            successes: row.get::<i64, _>("successes") as u32,
        })
        .collect())
}

#[tauri::command]
pub async fn record_capability_use(
    window: tauri::Window,
    state: State<'_, AppState>,
    name: String,
    kind: String,
    success: bool,
) -> Result<(), CommandError> {
    let project_id = state
        .open
        .lock()
        .unwrap()
        .get(window.label())
        .map(|p| p.id)
        .ok_or(CommandError::NoProject)?;

    sqlx::query(
        "INSERT INTO capability_stats (project_id, name, kind, uses, successes, updated_at)
         VALUES (?1, ?2, ?3, 1, ?4, ?5)
         ON CONFLICT(project_id, name, kind) DO UPDATE SET
             uses       = uses + 1,
             successes  = successes + excluded.successes,
             updated_at = excluded.updated_at",
    )
    .bind(project_id)
    .bind(&name)
    .bind(&kind)
    .bind(i64::from(success))
    .bind(
        SystemTime::now()
            .duration_since(UNIX_EPOCH)
            .unwrap_or_default()
            .as_millis() as i64,
    )
    .execute(&state.db)
    .await?;

    Ok(())
}
