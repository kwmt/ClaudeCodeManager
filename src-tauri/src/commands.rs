use crate::claude_data::ClaudeDataManager;
use crate::models::*;
use std::sync::Arc;
use tauri::State;

#[tauri::command]
pub async fn get_all_sessions(
    data_manager: State<'_, Arc<ClaudeDataManager>>,
) -> Result<Vec<ClaudeSession>, String> {
    data_manager
        .get_all_sessions()
        .await
        .map_err(|e| e.to_string())
}

#[tauri::command]
pub async fn get_changed_sessions(
    data_manager: State<'_, Arc<ClaudeDataManager>>,
) -> Result<Vec<ClaudeSession>, String> {
    data_manager
        .get_changed_sessions()
        .await
        .map_err(|e| e.to_string())
}

#[tauri::command]
pub async fn get_session_messages(
    session_id: String,
    data_manager: State<'_, Arc<ClaudeDataManager>>,
) -> Result<Vec<ClaudeMessage>, String> {
    data_manager
        .get_session_messages(&session_id)
        .await
        .map_err(|e| e.to_string())
}

#[tauri::command]
pub async fn get_command_history(
    data_manager: State<'_, Arc<ClaudeDataManager>>,
) -> Result<Vec<CommandLogEntry>, String> {
    data_manager
        .get_command_history()
        .await
        .map_err(|e| e.to_string())
}

#[tauri::command]
pub async fn get_todos(
    data_manager: State<'_, Arc<ClaudeDataManager>>,
) -> Result<Vec<TodoItem>, String> {
    data_manager.get_todos().await.map_err(|e| e.to_string())
}

#[tauri::command]
pub async fn get_settings(
    data_manager: State<'_, Arc<ClaudeDataManager>>,
) -> Result<ClaudeSettings, String> {
    data_manager.get_settings().await.map_err(|e| e.to_string())
}

#[tauri::command]
pub async fn get_project_summary(
    data_manager: State<'_, Arc<ClaudeDataManager>>,
) -> Result<Vec<ProjectSummary>, String> {
    data_manager
        .get_project_summary()
        .await
        .map_err(|e| e.to_string())
}

#[tauri::command]
pub async fn get_session_stats(
    data_manager: State<'_, Arc<ClaudeDataManager>>,
) -> Result<SessionStats, String> {
    data_manager
        .get_session_stats()
        .await
        .map_err(|e| e.to_string())
}

#[tauri::command]
pub async fn search_sessions(
    query: String,
    data_manager: State<'_, Arc<ClaudeDataManager>>,
) -> Result<Vec<ClaudeSession>, String> {
    let all_sessions = data_manager
        .get_all_sessions()
        .await
        .map_err(|e| e.to_string())?;

    let query_lower = query.to_lowercase();
    let filtered_sessions: Vec<ClaudeSession> = all_sessions
        .into_iter()
        .filter(|session| {
            session.project_path.to_lowercase().contains(&query_lower)
                || session.session_id.to_lowercase().contains(&query_lower)
                || session
                    .git_branch
                    .as_ref()
                    .map(|b| b.to_lowercase().contains(&query_lower))
                    .unwrap_or(false)
        })
        .collect();

    Ok(filtered_sessions)
}

#[tauri::command]
pub async fn search_commands(
    query: String,
    data_manager: State<'_, Arc<ClaudeDataManager>>,
) -> Result<Vec<CommandLogEntry>, String> {
    let all_commands = data_manager
        .get_command_history()
        .await
        .map_err(|e| e.to_string())?;

    let query_lower = query.to_lowercase();
    let filtered_commands: Vec<CommandLogEntry> = all_commands
        .into_iter()
        .filter(|cmd| cmd.command.to_lowercase().contains(&query_lower))
        .collect();

    Ok(filtered_commands)
}

#[tauri::command]
pub async fn export_session_data(
    session_id: String,
    data_manager: State<'_, Arc<ClaudeDataManager>>,
) -> Result<String, String> {
    let messages = data_manager
        .get_session_messages(&session_id)
        .await
        .map_err(|e| e.to_string())?;

    serde_json::to_string_pretty(&messages).map_err(|e| e.to_string())
}

// File watcher functionality disabled - was causing real-time updates
// #[tauri::command]
// pub async fn start_file_watcher(...) -> Result<(), String> { ... }
