mod commands;
mod error;
mod state;

use state::AppState;

#[cfg_attr(mobile, tauri::mobile_entry_point)]
pub fn run() {
    tauri::Builder::default()
        .manage(AppState::default())
        .invoke_handler(tauri::generate_handler![
            commands::app_info,
            commands::open_project,
            commands::project_root,
        ])
        .run(tauri::generate_context!())
        .expect("error while running Cantus");
}
