mod assets;
mod capabilities;
mod commands;
mod db;
mod error;
mod git;
mod memories;
mod orchestrations;
mod planner;
mod pty;
mod sessions;
mod state;
mod watcher;

use state::AppState;
use tauri::{DragDropEvent, Emitter, Manager, WindowEvent};

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
                open: std::sync::Mutex::new(std::collections::HashMap::new()),
                terminals: std::sync::Mutex::new(std::collections::HashMap::new()),
                next_terminal_id: std::sync::atomic::AtomicU32::new(0),
                next_window_id: std::sync::atomic::AtomicU32::new(1),
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
            commands::create_dir,
            commands::create_file,
            commands::move_path,
            commands::search_in_files,
            commands::list_files,
            commands::pty_spawn,
            commands::pty_write,
            commands::pty_resize,
            commands::pty_kill,
            commands::git_status,
            commands::git_stage,
            commands::git_unstage,
            commands::git_commit,
            commands::git_diff,
            commands::git_branches,
            commands::git_checkout,
            commands::git_create_branch,
            commands::git_discard,
            commands::git_stage_hunk,
            commands::git_unstage_hunk,
            commands::git_stage_lines,
            commands::git_unstage_lines,
            commands::git_discard_hunk,
            commands::git_discard_lines,
            sessions::list_sessions,
            orchestrations::list_orchestrations,
            orchestrations::save_orchestration,
            orchestrations::delete_orchestration,
            assets::list_claude_assets,
            capabilities::list_capability_stats,
            capabilities::record_capability_use,
            planner::plan_tasks,
            planner::gap_check,
            memories::list_memories,
            memories::add_memory,
            memories::update_memory,
            memories::delete_memory,
            memories::distill_memory,
            commands::open_in_new_window,
        ])
        // The built-in `tauri://drag-*` events were not reaching the webview
        // listener, so handle the OS drop here and re-emit a normal custom event
        // (which the frontend reliably receives) carrying the file paths + cursor.
        .on_window_event(|window, event| match event {
            WindowEvent::Destroyed => {
                window
                    .state::<AppState>()
                    .open
                    .lock()
                    .unwrap()
                    .remove(window.label());
            }
            WindowEvent::DragDrop(drag) => {
                let (phase, paths, position): (&str, Vec<std::path::PathBuf>, Option<(f64, f64)>) =
                    match drag {
                        DragDropEvent::Enter { paths, position } => {
                            ("over", paths.clone(), Some((position.x, position.y)))
                        }
                        DragDropEvent::Over { position } => {
                            ("over", Vec::new(), Some((position.x, position.y)))
                        }
                        DragDropEvent::Drop { paths, position } => {
                            ("drop", paths.clone(), Some((position.x, position.y)))
                        }
                        DragDropEvent::Leave => ("leave", Vec::new(), None),
                        _ => return,
                    };
                let paths: Vec<String> = paths
                    .iter()
                    .map(|p| p.to_string_lossy().into_owned())
                    .collect();
                let position = position.map(|(x, y)| serde_json::json!({ "x": x, "y": y }));
                let _ = window.emit(
                    "cantus://drag",
                    serde_json::json!({ "phase": phase, "paths": paths, "position": position }),
                );
            }
            _ => {}
        })
        .run(tauri::generate_context!())
        .expect("error while running Cantus");
}
