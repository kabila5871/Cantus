use sqlx::{sqlite::SqliteConnectOptions, SqlitePool};
use std::str::FromStr;
use tauri::Manager;

pub async fn open(app: &tauri::AppHandle) -> Result<SqlitePool, sqlx::Error> {
    let dir = app.path().app_data_dir().expect("app_data_dir unavailable");
    std::fs::create_dir_all(&dir).ok();
    let db_path = dir.join("cantus.db");
    let opts = SqliteConnectOptions::from_str(&format!("sqlite://{}", db_path.display()))?
        .create_if_missing(true);
    let pool = SqlitePool::connect_with(opts).await?;
    sqlx::query(
        "CREATE TABLE IF NOT EXISTS projects (
            id         INTEGER PRIMARY KEY AUTOINCREMENT,
            root_path  TEXT    NOT NULL UNIQUE,
            created_at TEXT    NOT NULL
        );
        CREATE TABLE IF NOT EXISTS files (
            id           INTEGER PRIMARY KEY AUTOINCREMENT,
            project_id   INTEGER NOT NULL REFERENCES projects(id),
            path         TEXT    NOT NULL,
            content_hash TEXT    NOT NULL,
            updated_at   TEXT    NOT NULL,
            UNIQUE(project_id, path)
        );",
    )
    .execute(&pool)
    .await?;
    Ok(pool)
}
