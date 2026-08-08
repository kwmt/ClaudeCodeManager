use std::sync::Arc;

mod claude_data;
mod commands;
mod models;
mod prompt_runner;
#[cfg(test)]
mod tests;

use claude_data::ClaudeDataManager;
use commands::*;
use prompt_runner::PromptRunner;

#[cfg_attr(mobile, tauri::mobile_entry_point)]
pub fn run() {
    let data_manager =
        Arc::new(ClaudeDataManager::new().expect("Failed to initialize Claude data manager"));

    tauri::Builder::default()
        .plugin(tauri_plugin_opener::init())
        .manage(data_manager)
        .manage(Arc::new(PromptRunner::new()))
        .invoke_handler(tauri::generate_handler![
            get_all_sessions,
            get_changed_sessions,
            get_session_messages,
            clear_cache,
            get_command_history,
            get_todos,
            get_settings,
            get_project_summary,
            get_session_stats,
            search_sessions,
            search_commands,
            export_session_data,
            activate_ide_window,
            open_session_file,
            get_project_path_mapping,
            get_home_directory,
            get_claude_directory_info,
            read_claude_file,
            write_claude_file,
            get_custom_commands,
            get_agents,
            save_custom_command,
            save_agent,
            delete_custom_command,
            delete_agent,
            rename_custom_command,
            rename_agent,
            get_all_settings_files,
            save_settings_file,
            get_claude_cli_status,
            start_prompt_run,
            stop_prompt_run
        ])
        .run(tauri::generate_context!())
        .expect("error while running tauri application");
}
