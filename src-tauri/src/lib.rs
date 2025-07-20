use std::sync::Arc;

mod claude_data;
mod commands;
mod models;
#[cfg(test)]
mod tests;

use claude_data::ClaudeDataManager;
use commands::*;

#[cfg_attr(mobile, tauri::mobile_entry_point)]
pub fn run() {
    let data_manager =
        Arc::new(ClaudeDataManager::new().expect("Failed to initialize Claude data manager"));

    tauri::Builder::default()
        .plugin(tauri_plugin_opener::init())
        .manage(data_manager)
        .invoke_handler(tauri::generate_handler![
            get_all_sessions,
            get_session_messages,
            get_command_history,
            get_todos,
            get_settings,
            get_project_summary,
            get_session_stats,
            search_sessions,
            search_commands,
            export_session_data
        ])
        .run(tauri::generate_context!())
        .expect("error while running tauri application");
}
