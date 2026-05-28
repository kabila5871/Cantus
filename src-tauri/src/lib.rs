mod agent;
mod commands;
mod db;
mod error;
mod git;
mod pty;
mod state;
mod watcher;

use state::AppState;
use tauri::Manager;

#[cfg_attr(mobile, tauri::mobile_entry_point)]
pub fn run() {
    tauri::Builder::default()
        .plugin(tauri_plugin_dialog::init())
        .setup(|app| {
            let handle = app.handle().clone();
            let pool =
                tauri::async_runtime::block_on(db::open(&handle)).expect("failed to open database");
            app.manage(AppState {
                db: pool,
                open: std::sync::Mutex::new(None),
                terminals: std::sync::Mutex::new(std::collections::HashMap::new()),
                next_terminal_id: std::sync::atomic::AtomicU32::new(0),
                agent: std::sync::Mutex::new(None),
                agent_generation: std::sync::atomic::AtomicU32::new(0),
            });
            Ok(())
        })
        .invoke_handler(tauri::generate_handler![
            commands::app_info,
            commands::open_project,
            commands::current_project,
            commands::read_dir,
            commands::read_file,
            commands::write_file,
            commands::pty_spawn,
            commands::pty_write,
            commands::pty_resize,
            commands::pty_kill,
            commands::git_status,
            commands::git_stage,
            commands::git_unstage,
            commands::git_commit,
            commands::git_diff,
            commands::agent_start,
            commands::agent_send,
            commands::agent_resolve_edit,
            commands::agent_stop,
            commands::agent_status,
        ])
        .run(tauri::generate_context!())
        .expect("error while running Cantus");
}
