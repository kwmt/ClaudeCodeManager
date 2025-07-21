use crate::claude_data::ClaudeDataManager;
use crate::models::*;
use notify::{Config, Event, RecommendedWatcher, RecursiveMode, Watcher};
use serde::Serialize;
use std::sync::mpsc;
use std::sync::Arc;
use std::time::Duration;
use tauri::{AppHandle, Emitter, State};

#[derive(Serialize, Clone)]
struct FileChangeEvent {
    message: String,
}

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

#[tauri::command]
pub async fn start_file_watcher(
    app: AppHandle,
    data_manager: State<'_, Arc<ClaudeDataManager>>,
) -> Result<(), String> {
    let data_manager_clone = data_manager.inner().clone();
    let app_clone = app.clone();

    tokio::spawn(async move {
        let claude_dir = dirs::home_dir()
            .map(|home| home.join(".claude"))
            .ok_or("Could not find home directory".to_string())?;

        let (tx, rx) = mpsc::channel();

        let mut watcher = RecommendedWatcher::new(
            move |res: Result<Event, notify::Error>| {
                if let Ok(event) = res {
                    let _ = tx.send(event);
                }
            },
            Config::default(),
        )
        .map_err(|e| e.to_string())?;

        watcher
            .watch(&claude_dir, RecursiveMode::Recursive)
            .map_err(|e| e.to_string())?;

        // Process file change events
        while let Ok(event) = rx.recv() {
            // Debounce: wait a bit to avoid rapid fire events
            tokio::time::sleep(Duration::from_millis(500)).await;

            // Only invalidate specific session caches if we can identify the changed file
            if let Some(path) = event.paths.first() {
                if path.extension().and_then(|e| e.to_str()) == Some("jsonl") {
                    if let Some(session_id) = path.file_stem().and_then(|n| n.to_str()) {
                        data_manager_clone.invalidate_session_cache(session_id).await;
                    }
                } else {
                    // For non-session files, invalidate all caches
                    data_manager_clone.invalidate_caches().await;
                }
            } else {
                // If we can't determine the specific file, invalidate all caches
                data_manager_clone.invalidate_caches().await;
            }

            // Emit event to frontend
            let file_change_event = FileChangeEvent {
                message: "Claude directory changed".to_string(),
            };
            let _ = app_clone.emit("file-changed", file_change_event);
        }

        Ok::<(), String>(())
    });

    Ok(())
}
