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
        );
        CREATE TABLE IF NOT EXISTS orchestrations (
            id         INTEGER PRIMARY KEY AUTOINCREMENT,
            project_id INTEGER NOT NULL REFERENCES projects(id),
            sid        TEXT    NOT NULL,
            title      TEXT    NOT NULL,
            goal       TEXT    NOT NULL,
            tasks      TEXT    NOT NULL,
            updated_at INTEGER NOT NULL,
            UNIQUE(project_id, sid)
        );
        CREATE TABLE IF NOT EXISTS capability_stats (
            id         INTEGER PRIMARY KEY AUTOINCREMENT,
            project_id INTEGER NOT NULL REFERENCES projects(id),
            name       TEXT    NOT NULL,
            kind       TEXT    NOT NULL,
            uses       INTEGER NOT NULL DEFAULT 0,
            successes  INTEGER NOT NULL DEFAULT 0,
            updated_at INTEGER NOT NULL,
            UNIQUE(project_id, name, kind)
        );
        CREATE TABLE IF NOT EXISTS memories (
            id           INTEGER PRIMARY KEY AUTOINCREMENT,
            project_id   INTEGER NOT NULL REFERENCES projects(id),
            fact         TEXT    NOT NULL,
            task_type    TEXT    NOT NULL DEFAULT '',
            capabilities TEXT    NOT NULL DEFAULT '[]',
            retries      INTEGER NOT NULL DEFAULT 0,
            confidence   REAL    NOT NULL DEFAULT 0.5,
            created_at   INTEGER NOT NULL
        );",
    )
    .execute(&pool)
    .await?;

    // Relevance retrieval for the learned-memory layer. FTS5 ships in the bundled
    // SQLite, but guard against a build that lacks it: a failure here just means
    // memory search degrades to none — it must not block startup.
    let _ = sqlx::query(
        "CREATE VIRTUAL TABLE IF NOT EXISTS memories_fts USING fts5(
            fact, task_type, capabilities, content='memories', content_rowid='id'
        );
        CREATE TRIGGER IF NOT EXISTS memories_ai AFTER INSERT ON memories BEGIN
            INSERT INTO memories_fts(rowid, fact, task_type, capabilities)
            VALUES (new.id, new.fact, new.task_type, new.capabilities);
        END;
        CREATE TRIGGER IF NOT EXISTS memories_ad AFTER DELETE ON memories BEGIN
            INSERT INTO memories_fts(memories_fts, rowid, fact, task_type, capabilities)
            VALUES ('delete', old.id, old.fact, old.task_type, old.capabilities);
        END;
        CREATE TRIGGER IF NOT EXISTS memories_au AFTER UPDATE ON memories BEGIN
            INSERT INTO memories_fts(memories_fts, rowid, fact, task_type, capabilities)
            VALUES ('delete', old.id, old.fact, old.task_type, old.capabilities);
            INSERT INTO memories_fts(rowid, fact, task_type, capabilities)
            VALUES (new.id, new.fact, new.task_type, new.capabilities);
        END;
        INSERT INTO memories_fts(memories_fts) VALUES('rebuild');",
    )
    .execute(&pool)
    .await;

    Ok(pool)
}
