use crate::models::*;
use chrono::{DateTime, Utc};
use dirs::home_dir;
use notify::{Config, Event, RecommendedWatcher, RecursiveMode, Watcher};
use std::collections::HashMap;
use std::fs;
use std::io::{BufRead, BufReader};
use std::path::{Path, PathBuf};
use std::sync::mpsc;
use tokio::sync::RwLock;

pub struct ClaudeDataManager {
    claude_dir: PathBuf,
    _sessions_cache: RwLock<HashMap<String, ClaudeSession>>,
    messages_cache: RwLock<HashMap<String, Vec<ClaudeMessage>>>,
    file_timestamps: RwLock<HashMap<PathBuf, DateTime<Utc>>>,
    _watcher: Option<RecommendedWatcher>,
}

impl ClaudeDataManager {
    pub fn new() -> Result<Self, Box<dyn std::error::Error>> {
        let home = home_dir().ok_or("Could not find home directory")?;
        let claude_dir = home.join(".claude");

        if !claude_dir.exists() {
            return Err("~/.claude directory not found".into());
        }

        // Create file watcher
        let (tx, _rx) = mpsc::channel();
        let mut watcher = RecommendedWatcher::new(
            move |res: Result<Event, notify::Error>| {
                match res {
                    Ok(event) => {
                        // Send file change events through the channel
                        let _ = tx.send(event);
                    }
                    Err(e) => eprintln!("File watcher error: {e:?}"),
                }
            },
            Config::default(),
        )?;

        // Watch the .claude directory recursively
        watcher.watch(&claude_dir, RecursiveMode::Recursive)?;

        Ok(Self {
            claude_dir,
            _sessions_cache: RwLock::new(HashMap::new()),
            messages_cache: RwLock::new(HashMap::new()),
            file_timestamps: RwLock::new(HashMap::new()),
            _watcher: Some(watcher),
        })
    }

    #[cfg(test)]
    pub fn new_with_dir(claude_dir: &Path) -> Result<Self, Box<dyn std::error::Error>> {
        if !claude_dir.exists() {
            return Err("Claude directory not found".into());
        }

        Ok(Self {
            claude_dir: claude_dir.to_path_buf(),
            _sessions_cache: RwLock::new(HashMap::new()),
            messages_cache: RwLock::new(HashMap::new()),
            file_timestamps: RwLock::new(HashMap::new()),
            _watcher: None, // No watcher in test mode
        })
    }

    pub async fn get_all_sessions(&self) -> Result<Vec<ClaudeSession>, Box<dyn std::error::Error>> {
        let projects_dir = self.claude_dir.join("projects");
        let mut sessions = Vec::new();
        let mut project_path_map: HashMap<String, String> = HashMap::new();

        if !projects_dir.exists() {
            return Ok(sessions);
        }

        // First, collect all sessions to build a complete mapping
        for entry in fs::read_dir(&projects_dir)? {
            let entry = entry?;
            let project_path = entry.path();
            if project_path.is_dir() {
                let project_name = project_path
                    .file_name()
                    .and_then(|n| n.to_str())
                    .unwrap_or("")
                    .to_string();

                // Check if this is an encoded path
                if project_name.starts_with('-') {
                    // Try to get the actual path from the first session file
                    if let Ok(session_files) = fs::read_dir(&project_path) {
                        for file in session_files.flatten() {
                            let file_path = file.path();
                            if file_path.extension().is_some_and(|ext| ext == "jsonl") {
                                if let Some(actual_path) =
                                    self.extract_cwd_from_session_file(&file_path).await?
                                {
                                    project_path_map
                                        .insert(project_name.clone(), actual_path.clone());
                                    break;
                                }
                            }
                        }
                    }
                }
            }
        }

        // Now process all sessions with the mapping
        for entry in fs::read_dir(&projects_dir)? {
            let entry = entry?;
            let project_path = entry.path();
            if project_path.is_dir() {
                let project_name = project_path
                    .file_name()
                    .and_then(|n| n.to_str())
                    .unwrap_or("")
                    .to_string();

                for session_file in fs::read_dir(&project_path)? {
                    let session_file = session_file?;
                    let file_path = session_file.path();

                    if file_path.extension().and_then(|e| e.to_str()) == Some("jsonl") {
                        let session_id = file_path
                            .file_stem()
                            .and_then(|n| n.to_str())
                            .unwrap_or("")
                            .to_string();

                        // Use mapped path if available
                        let effective_project_name = if project_name.starts_with('-') {
                            project_path_map
                                .get(&project_name)
                                .cloned()
                                .unwrap_or_else(|| project_name.clone())
                        } else {
                            project_name.clone()
                        };

                        let session = self
                            .parse_session_file(&file_path, &session_id, &effective_project_name)
                            .await?;
                        sessions.push(session);
                    }
                }
            }
        }

        sessions.sort_by(|a, b| b.timestamp.cmp(&a.timestamp));
        Ok(sessions)
    }

    async fn parse_session_file(
        &self,
        file_path: &Path,
        session_id: &str,
        project_path: &str,
    ) -> Result<ClaudeSession, Box<dyn std::error::Error>> {
        // Get file modification time first
        let file_modified_time = self.get_file_modified_time(file_path).await?;
        let file = fs::File::open(file_path)?;
        let reader = BufReader::new(file);

        let mut message_count = 0;
        let mut first_timestamp: Option<DateTime<Utc>> = None;
        let mut git_branch: Option<String> = None;
        let mut latest_content_preview: Option<String> = None;
        let mut latest_timestamp: Option<DateTime<Utc>> = None;
        let mut has_incomplete_sequence = false;
        let mut actual_project_path: Option<String> = None;

        for line in reader.lines() {
            let line = line?;
            if let Ok(message) = serde_json::from_str::<serde_json::Value>(&line) {
                message_count += 1;

                if let Some(timestamp_str) = message.get("timestamp").and_then(|t| t.as_str()) {
                    if let Ok(timestamp) = timestamp_str.parse::<DateTime<Utc>>() {
                        // Keep the first timestamp we encounter
                        if first_timestamp.is_none() {
                            first_timestamp = Some(timestamp);
                        }

                        // Extract latest content for preview
                        if latest_timestamp.is_none() || timestamp > latest_timestamp.unwrap() {
                            latest_timestamp = Some(timestamp);
                            latest_content_preview = self.extract_content_preview(&message);
                        }
                    }
                }

                if git_branch.is_none() {
                    if let Some(branch) = message.get("gitBranch").and_then(|b| b.as_str()) {
                        if !branch.is_empty() {
                            git_branch = Some(branch.to_string());
                        }
                    }
                }

                // Get the actual project path from cwd
                if actual_project_path.is_none() {
                    if let Some(cwd) = message.get("cwd").and_then(|c| c.as_str()) {
                        if !cwd.is_empty() {
                            actual_project_path = Some(cwd.to_string());
                        }
                    }
                }

                // Check for incomplete sequences (assistant messages without stop_reason)
                if message.get("type").and_then(|t| t.as_str()) == Some("assistant") {
                    let has_stop_reason = message
                        .get("message")
                        .and_then(|m| m.get("stop_reason"))
                        .is_some();

                    if !has_stop_reason {
                        has_incomplete_sequence = true;
                    }
                }
            }
        }

        // Use actual project path from cwd if available, otherwise fall back to encoded path
        let display_project_path = actual_project_path.unwrap_or_else(|| project_path.to_string());

        let ide_info = self.find_ide_info_for_project(&display_project_path).await;

        Ok(ClaudeSession {
            session_id: session_id.to_string(),
            project_path: display_project_path,
            timestamp: first_timestamp.unwrap_or_else(Utc::now),
            message_count,
            git_branch,
            latest_content_preview,
            ide_info,
            is_processing: has_incomplete_sequence,
            file_modified_time,
        })
    }

    pub async fn get_session_messages(
        &self,
        session_id: &str,
    ) -> Result<Vec<ClaudeMessage>, Box<dyn std::error::Error>> {
        // Check cache first
        {
            let cache = self.messages_cache.read().await;
            if let Some(messages) = cache.get(session_id) {
                return Ok(messages.clone());
            }
        }

        // Find session file
        let session_file = self.find_session_file(session_id)?;
        let messages = self.parse_messages_file(&session_file, session_id).await?;

        // Cache the result
        {
            let mut cache = self.messages_cache.write().await;
            cache.insert(session_id.to_string(), messages.clone());
        }

        Ok(messages)
    }

    fn find_session_file(&self, session_id: &str) -> Result<PathBuf, Box<dyn std::error::Error>> {
        let projects_dir = self.claude_dir.join("projects");

        for entry in fs::read_dir(&projects_dir)? {
            let entry = entry?;
            let project_path = entry.path();

            if project_path.is_dir() {
                let session_file = project_path.join(format!("{session_id}.jsonl"));
                if session_file.exists() {
                    return Ok(session_file);
                }
            }
        }

        Err(format!("Session file not found for ID: {session_id}").into())
    }

    async fn parse_messages_file(
        &self,
        file_path: &Path,
        session_id: &str,
    ) -> Result<Vec<ClaudeMessage>, Box<dyn std::error::Error>> {
        let file = fs::File::open(file_path)?;
        let reader = BufReader::new(file);
        let mut messages = Vec::new();

        for line in reader.lines() {
            let line = line?;
            if let Ok(raw_message) = serde_json::from_str::<serde_json::Value>(&line) {
                if let Some(message) = self.parse_claude_message(&raw_message, session_id)? {
                    messages.push(message);
                }
            }
        }

        Ok(messages)
    }

    fn parse_claude_message(
        &self,
        raw: &serde_json::Value,
        session_id: &str,
    ) -> Result<Option<ClaudeMessage>, Box<dyn std::error::Error>> {
        let uuid = raw
            .get("uuid")
            .and_then(|u| u.as_str())
            .unwrap_or("")
            .to_string();

        let parent_uuid = raw
            .get("parentUuid")
            .and_then(|u| u.as_str())
            .map(|s| s.to_string());

        let timestamp_str = raw.get("timestamp").and_then(|t| t.as_str()).unwrap_or("");

        let timestamp = timestamp_str
            .parse::<DateTime<Utc>>()
            .unwrap_or_else(|_| Utc::now());

        let cwd = raw
            .get("cwd")
            .and_then(|c| c.as_str())
            .unwrap_or("")
            .to_string();

        let git_branch = raw
            .get("gitBranch")
            .and_then(|b| b.as_str())
            .map(|s| s.to_string());

        let message = match raw.get("type").and_then(|t| t.as_str()) {
            Some("user") => {
                let content_text = raw
                    .get("message")
                    .and_then(|m| m.get("content"))
                    .and_then(|c| c.as_str())
                    .unwrap_or("")
                    .to_string();

                let content = MessageContent::User {
                    role: "user".to_string(),
                    content: content_text,
                };

                // User messages are always completed when they exist
                let processing_status = crate::models::ProcessingStatus::Completed;

                ClaudeMessage::User {
                    uuid,
                    parent_uuid,
                    session_id: session_id.to_string(),
                    timestamp,
                    content,
                    cwd,
                    git_branch,
                    processing_status,
                }
            }
            Some("assistant") => {
                let content_blocks: Vec<crate::models::ContentBlock> = raw
                    .get("message")
                    .and_then(|m| m.get("content"))
                    .and_then(|c| c.as_array())
                    .map(|blocks| {
                        blocks
                            .iter()
                            .filter_map(|block| self.parse_content_block(block))
                            .collect()
                    })
                    .unwrap_or_default();

                // Extract stop_reason and determine processing status before moving content_blocks
                let stop_reason = raw
                    .get("message")
                    .and_then(|m| m.get("stop_reason"))
                    .and_then(|sr| sr.as_str())
                    .map(|s| s.to_string());

                let processing_status = match &stop_reason {
                    Some(reason) => match reason.as_str() {
                        "end_turn" => crate::models::ProcessingStatus::Completed,
                        "max_tokens" => crate::models::ProcessingStatus::Stopped,
                        "stop_sequence" => crate::models::ProcessingStatus::Stopped,
                        "tool_use" => crate::models::ProcessingStatus::Completed,
                        _ => crate::models::ProcessingStatus::Error,
                    },
                    // If stop_reason is missing, consider it processing (without animation)
                    None => crate::models::ProcessingStatus::Processing,
                };

                let content = MessageContent::Assistant {
                    role: "assistant".to_string(),
                    content: content_blocks,
                };

                ClaudeMessage::Assistant {
                    uuid,
                    parent_uuid,
                    session_id: session_id.to_string(),
                    timestamp,
                    content,
                    cwd,
                    git_branch,
                    processing_status,
                    stop_reason,
                }
            }
            Some("summary") => {
                let summary = raw
                    .get("summary")
                    .and_then(|s| s.as_str())
                    .unwrap_or("")
                    .to_string();

                let leaf_uuid = raw
                    .get("leafUuid")
                    .and_then(|u| u.as_str())
                    .unwrap_or("")
                    .to_string();

                ClaudeMessage::Summary { summary, leaf_uuid }
            }
            _ => return Ok(None),
        };

        Ok(Some(message))
    }

    fn parse_content_block(&self, block: &serde_json::Value) -> Option<ContentBlock> {
        match block.get("type").and_then(|t| t.as_str()) {
            Some("text") => {
                let text = block
                    .get("text")
                    .and_then(|t| t.as_str())
                    .unwrap_or("")
                    .to_string();
                Some(ContentBlock::Text { text })
            }
            Some("tool_use") => {
                let id = block
                    .get("id")
                    .and_then(|i| i.as_str())
                    .unwrap_or("")
                    .to_string();
                let name = block
                    .get("name")
                    .and_then(|n| n.as_str())
                    .unwrap_or("")
                    .to_string();
                let input = block
                    .get("input")
                    .cloned()
                    .unwrap_or(serde_json::Value::Null);

                Some(ContentBlock::ToolUse { id, name, input })
            }
            _ => None,
        }
    }

    fn extract_content_preview(&self, message: &serde_json::Value) -> Option<String> {
        let msg_type = message.get("type").and_then(|t| t.as_str())?;

        match msg_type {
            "user" => {
                // Extract text from user message
                message
                    .get("message")
                    .and_then(|m| m.get("content"))
                    .and_then(|c| c.as_str())
                    .map(|content| self.truncate_content(content, 200))
            }
            "assistant" => {
                // Extract text from assistant message blocks
                let content_blocks = message
                    .get("message")
                    .and_then(|m| m.get("content"))
                    .and_then(|c| c.as_array())?;

                let mut text_parts = Vec::new();

                for block in content_blocks {
                    if block.get("type").and_then(|t| t.as_str()) == Some("text") {
                        if let Some(text) = block.get("text").and_then(|t| t.as_str()) {
                            text_parts.push(text.to_string());
                        }
                    } else if block.get("type").and_then(|t| t.as_str()) == Some("tool_use") {
                        if let Some(name) = block.get("name").and_then(|n| n.as_str()) {
                            text_parts.push(format!("[Using tool: {name}]"));
                        }
                    }
                }

                if !text_parts.is_empty() {
                    Some(self.truncate_content(&text_parts.join(" "), 200))
                } else {
                    None
                }
            }
            "summary" => {
                // Extract summary text
                message
                    .get("summary")
                    .and_then(|s| s.as_str())
                    .map(|summary| self.truncate_content(summary, 200))
            }
            _ => None,
        }
    }

    fn truncate_content(&self, content: &str, max_chars: usize) -> String {
        let cleaned = content
            .replace('\n', " ")
            .replace('\r', "")
            .chars()
            .filter(|c| !c.is_control() || c.is_whitespace())
            .collect::<String>();

        let trimmed = cleaned.trim();

        // 2行に収まるように、日本語を考慮してより短めにカット
        // 日本語は全角文字なので表示幅が広い。安全のため50文字程度に制限
        let adjusted_max = if max_chars > 100 {
            50
        } else {
            max_chars.min(50)
        };

        if trimmed.chars().count() <= adjusted_max {
            trimmed.to_string()
        } else {
            let truncated: String = trimmed.chars().take(adjusted_max).collect();
            // 日本語の場合、句読点や助詞で区切るのが自然だが、スペースで区切ることもある
            if let Some(last_space) = truncated.rfind(' ') {
                let truncated_at_space = &truncated[..last_space];
                format!("{truncated_at_space}...")
            } else {
                format!("{truncated}...")
            }
        }
    }

    pub async fn get_command_history(
        &self,
    ) -> Result<Vec<CommandLogEntry>, Box<dyn std::error::Error>> {
        let log_file = self.claude_dir.join("command_history.log");

        if !log_file.exists() {
            return Ok(Vec::new());
        }

        let content = fs::read_to_string(&log_file)?;
        let mut entries = Vec::new();

        for line in content.lines() {
            if let Some(entry) = self.parse_command_log_line(line) {
                entries.push(entry);
            }
        }

        entries.sort_by(|a, b| b.timestamp.cmp(&a.timestamp));
        Ok(entries)
    }

    fn parse_command_log_line(&self, line: &str) -> Option<CommandLogEntry> {
        // Parse format: [Thu Jul 17 15:18:23 JST 2025] user: command
        if let Some(start) = line.find('[') {
            if let Some(end) = line.find(']') {
                let _timestamp_str = &line[start + 1..end];

                // Look for '] ' pattern and skip it using character boundaries
                let pattern = "] ";
                if let Some(pattern_pos) = line[end..].find(pattern) {
                    let start_pos = end + pattern_pos + pattern.len();

                    // Make sure we don't go beyond string boundaries
                    if start_pos >= line.len() {
                        return None;
                    }

                    // Use safe character boundary slice
                    let remaining = &line[start_pos..];

                    // Find the first colon in the remaining part
                    if let Some(colon_pos) = remaining.find(':') {
                        let user_part = &remaining[..colon_pos];

                        // Find command after ': ' using safe slicing
                        let command_pattern = ": ";
                        if let Some(cmd_start) = remaining[colon_pos..].find(command_pattern) {
                            let cmd_pos = colon_pos + cmd_start + command_pattern.len();
                            if cmd_pos < remaining.len() {
                                let command = &remaining[cmd_pos..];

                                // Try to parse timestamp (simplified)
                                let timestamp = Utc::now(); // For now, use current time

                                return Some(CommandLogEntry {
                                    timestamp,
                                    user: user_part.to_string(),
                                    command: command.to_string(),
                                    cwd: None,
                                });
                            }
                        }
                    }
                }
            }
        }
        None
    }

    pub async fn get_todos(&self) -> Result<Vec<TodoItem>, Box<dyn std::error::Error>> {
        let todos_dir = self.claude_dir.join("todos");
        let mut all_todos = Vec::new();

        if !todos_dir.exists() {
            return Ok(all_todos);
        }

        for entry in fs::read_dir(&todos_dir)? {
            let entry = entry?;
            let file_path = entry.path();

            if file_path.extension().and_then(|e| e.to_str()) == Some("json") {
                if let Ok(content) = fs::read_to_string(&file_path) {
                    if let Ok(todos) = serde_json::from_str::<Vec<TodoItem>>(&content) {
                        all_todos.extend(todos);
                    }
                }
            }
        }

        Ok(all_todos)
    }

    pub async fn get_settings(&self) -> Result<ClaudeSettings, Box<dyn std::error::Error>> {
        let settings_file = self.claude_dir.join("settings.json");

        if !settings_file.exists() {
            return Err("Settings file not found".into());
        }

        let content = fs::read_to_string(&settings_file)?;
        let settings = serde_json::from_str(&content)?;
        Ok(settings)
    }

    pub async fn get_project_summary(
        &self,
    ) -> Result<Vec<ProjectSummary>, Box<dyn std::error::Error>> {
        let sessions = self.get_all_sessions().await?;
        let mut project_map: HashMap<String, ProjectSummary> = HashMap::new();

        // Create a mapping for project path normalization
        let path_mapping = self.get_project_path_mapping().await?;

        for session in sessions {
            // Normalize project path - if it's an encoded path, use the actual path from mapping
            let normalized_path = if session.project_path.starts_with('-') {
                path_mapping
                    .get(&session.project_path)
                    .cloned()
                    .unwrap_or_else(|| session.project_path.clone())
            } else {
                session.project_path.clone()
            };

            let entry = project_map
                .entry(normalized_path.clone())
                .or_insert_with(|| ProjectSummary {
                    project_path: normalized_path.clone(),
                    session_count: 0,
                    last_activity: session.file_modified_time,
                    total_messages: 0,
                    active_todos: 0,
                    ide_info: None,
                });

            entry.session_count += 1;
            entry.total_messages += session.message_count;

            // Update last_activity to the latest file_modified_time
            if session.file_modified_time > entry.last_activity {
                entry.last_activity = session.file_modified_time;
            }

            // Update IDE info if this session has it and we don't have it yet
            if entry.ide_info.is_none() && session.ide_info.is_some() {
                entry.ide_info = session.ide_info.clone();
            }
        }

        let mut projects: Vec<ProjectSummary> = project_map.into_values().collect();
        // Sort by last_activity in descending order (most recent first)
        projects.sort_by(|a, b| b.last_activity.cmp(&a.last_activity));
        Ok(projects)
    }

    pub async fn get_session_stats(&self) -> Result<SessionStats, Box<dyn std::error::Error>> {
        let sessions = self.get_all_sessions().await?;
        let commands = self.get_command_history().await?;
        let todos = self.get_todos().await?;

        let total_messages = sessions.iter().map(|s| s.message_count).sum();
        let active_projects = sessions
            .iter()
            .map(|s| &s.project_path)
            .collect::<std::collections::HashSet<_>>()
            .len();
        let pending_todos = todos
            .iter()
            .filter(|t| matches!(t.status, TodoStatus::Pending | TodoStatus::InProgress))
            .count();

        Ok(SessionStats {
            total_sessions: sessions.len(),
            total_messages,
            total_commands: commands.len(),
            active_projects,
            pending_todos,
        })
    }

    async fn get_file_modified_time(
        &self,
        path: &Path,
    ) -> Result<DateTime<Utc>, Box<dyn std::error::Error>> {
        let metadata = fs::metadata(path)?;
        let modified = metadata.modified()?;
        let datetime = DateTime::<Utc>::from(modified);
        Ok(datetime)
    }

    pub async fn get_changed_sessions(
        &self,
    ) -> Result<Vec<ClaudeSession>, Box<dyn std::error::Error>> {
        let projects_dir = self.claude_dir.join("projects");
        let mut changed_sessions = Vec::new();
        let mut timestamps = self.file_timestamps.write().await;

        if !projects_dir.exists() {
            return Ok(changed_sessions);
        }

        for entry in fs::read_dir(&projects_dir)? {
            let entry = entry?;
            let project_path = entry.path();

            if project_path.is_dir() {
                let project_name = project_path
                    .file_name()
                    .and_then(|n| n.to_str())
                    .unwrap_or("")
                    .to_string();

                for session_file in fs::read_dir(&project_path)? {
                    let session_file = session_file?;
                    let file_path = session_file.path();

                    if file_path.extension().and_then(|e| e.to_str()) == Some("jsonl") {
                        let current_time = self.get_file_modified_time(&file_path).await?;
                        let last_known_time = timestamps.get(&file_path);

                        if last_known_time.is_none_or(|&t| current_time > t) {
                            let session_id = file_path
                                .file_stem()
                                .and_then(|n| n.to_str())
                                .unwrap_or("")
                                .to_string();

                            let session = self
                                .parse_session_file(&file_path, &session_id, &project_name)
                                .await?;
                            changed_sessions.push(session);
                            timestamps.insert(file_path.clone(), current_time);
                        }
                    }
                }
            }
        }

        changed_sessions.sort_by(|a, b| b.timestamp.cmp(&a.timestamp));
        Ok(changed_sessions)
    }

    async fn find_ide_info_for_project(&self, project_path: &str) -> Option<IdeInfo> {
        let ide_dir = self.claude_dir.join("ide");

        if !ide_dir.exists() {
            return None;
        }

        // Read all IDE lock files
        if let Ok(entries) = fs::read_dir(&ide_dir) {
            for entry in entries.flatten() {
                let file_path = entry.path();

                if file_path.extension().and_then(|e| e.to_str()) == Some("lock") {
                    if let Ok(content) = fs::read_to_string(&file_path) {
                        if let Ok(ide_data) = serde_json::from_str::<serde_json::Value>(&content) {
                            // Check if this IDE instance has the project in workspace folders
                            if let Some(workspace_folders) =
                                ide_data.get("workspaceFolders").and_then(|w| w.as_array())
                            {
                                for folder in workspace_folders {
                                    if let Some(folder_path) = folder.as_str() {
                                        if folder_path == project_path {
                                            // Found matching IDE instance, extract info
                                            return Some(IdeInfo {
                                                pid: ide_data
                                                    .get("pid")
                                                    .and_then(|p| p.as_u64())
                                                    .unwrap_or(0)
                                                    as u32,
                                                workspace_folders: workspace_folders
                                                    .iter()
                                                    .filter_map(|f| f.as_str())
                                                    .map(|s| s.to_string())
                                                    .collect(),
                                                ide_name: ide_data
                                                    .get("ideName")
                                                    .and_then(|n| n.as_str())
                                                    .unwrap_or("Unknown")
                                                    .to_string(),
                                                transport: ide_data
                                                    .get("transport")
                                                    .and_then(|t| t.as_str())
                                                    .unwrap_or("unknown")
                                                    .to_string(),
                                                running_in_windows: ide_data
                                                    .get("runningInWindows")
                                                    .and_then(|r| r.as_bool())
                                                    .unwrap_or(false),
                                                auth_token: ide_data
                                                    .get("authToken")
                                                    .and_then(|a| a.as_str())
                                                    .unwrap_or("")
                                                    .to_string(),
                                            });
                                        }
                                    }
                                }
                            }
                        }
                    }
                }
            }
        }

        None
    }

    pub async fn activate_ide_window(
        &self,
        ide_info: &IdeInfo,
    ) -> Result<(), Box<dyn std::error::Error>> {
        #[cfg(target_os = "macos")]
        {
            // Use AppleScript to bring VS Code window to front on macOS
            let script = format!(
                r#"
                tell application "System Events"
                    set frontmost of first process whose unix id is {} to true
                end tell
                "#,
                ide_info.pid
            );

            std::process::Command::new("osascript")
                .arg("-e")
                .arg(&script)
                .output()?;
        }

        #[cfg(target_os = "windows")]
        {
            // Windows implementation would go here
            // For now, return an error
            return Err("Window activation not yet implemented for Windows".into());
        }

        #[cfg(target_os = "linux")]
        {
            // Linux implementation would go here
            // For now, return an error
            return Err("Window activation not yet implemented for Linux".into());
        }

        Ok(())
    }

    pub async fn get_project_path_mapping(
        &self,
    ) -> Result<HashMap<String, String>, Box<dyn std::error::Error>> {
        let mut mapping = HashMap::new();
        let projects_dir = self.claude_dir.join("projects");

        if !projects_dir.exists() {
            return Ok(mapping);
        }

        for entry in fs::read_dir(&projects_dir)? {
            let entry = entry?;
            let encoded_path = entry.file_name().to_string_lossy().to_string();

            if !encoded_path.starts_with('-') {
                continue;
            }

            // Try to read the first few messages from any session file to get the cwd
            let session_dir = entry.path();
            if let Ok(session_files) = fs::read_dir(&session_dir) {
                for file in session_files.flatten() {
                    let file_path = file.path();
                    if file_path.extension().is_some_and(|ext| ext == "jsonl") {
                        if let Some(actual_path) =
                            self.extract_cwd_from_session_file(&file_path).await?
                        {
                            mapping.insert(encoded_path.clone(), actual_path);
                            break; // Found one, move to next project
                        }
                    }
                }
            }
        }

        Ok(mapping)
    }

    pub async fn extract_cwd_from_session_file(
        &self,
        file_path: &Path,
    ) -> Result<Option<String>, Box<dyn std::error::Error>> {
        let file = fs::File::open(file_path)?;
        let reader = BufReader::new(file);
        let mut lines = reader.lines();

        // Read only the first few lines to avoid parsing entire large files
        for _ in 0..10 {
            if let Some(line) = lines.next() {
                let line = line?;
                if let Ok(message) = serde_json::from_str::<serde_json::Value>(&line) {
                    // Extract cwd field directly from JSON
                    if let Some(cwd) = message.get("cwd").and_then(|c| c.as_str()) {
                        if !cwd.is_empty() {
                            return Ok(Some(cwd.to_string()));
                        }
                    }
                }
            } else {
                break;
            }
        }

        Ok(None)
    }

    pub async fn get_claude_directory_info(
        &self,
        project_path: &str,
    ) -> Result<ClaudeDirectoryInfo, Box<dyn std::error::Error>> {
        let claude_dir_path = PathBuf::from(project_path).join(".claude");
        let exists = claude_dir_path.exists() && claude_dir_path.is_dir();

        let mut files = Vec::new();

        if exists {
            Self::read_directory_recursive(&claude_dir_path, &claude_dir_path, &mut files)?;
        }

        Ok(ClaudeDirectoryInfo {
            path: claude_dir_path.to_string_lossy().to_string(),
            exists,
            files,
        })
    }

    fn read_directory_recursive(
        base_path: &Path,
        current_path: &Path,
        files: &mut Vec<ClaudeDirectoryFile>,
    ) -> Result<(), Box<dyn std::error::Error>> {
        if let Ok(entries) = fs::read_dir(current_path) {
            for entry in entries.flatten() {
                let path = entry.path();
                let metadata = entry.metadata()?;

                // Get relative path from the base .claude directory
                let relative_path = path
                    .strip_prefix(base_path)
                    .unwrap_or(&path)
                    .to_string_lossy()
                    .to_string();

                let file_info = ClaudeDirectoryFile {
                    name: relative_path,
                    path: path.to_string_lossy().to_string(),
                    size: metadata.len(),
                    modified: DateTime::<Utc>::from(metadata.modified()?),
                    is_directory: metadata.is_dir(),
                };

                files.push(file_info);

                // Recursively read subdirectories
                if metadata.is_dir() {
                    Self::read_directory_recursive(base_path, &path, files)?;
                }
            }
        }

        Ok(())
    }

    pub async fn read_claude_file(
        &self,
        file_path: &str,
    ) -> Result<String, Box<dyn std::error::Error>> {
        let path = PathBuf::from(file_path);

        // Security check: ensure the file is within a .claude directory
        let mut current = path.as_path();
        let mut is_in_claude_dir = false;

        while let Some(parent) = current.parent() {
            if current.file_name() == Some(std::ffi::OsStr::new(".claude")) {
                is_in_claude_dir = true;
                break;
            }
            current = parent;
        }

        if !is_in_claude_dir {
            return Err("File must be within a .claude directory".into());
        }

        fs::read_to_string(&path).map_err(|e| e.into())
    }

    pub async fn write_claude_file(
        &self,
        file_path: &str,
        content: &str,
    ) -> Result<(), Box<dyn std::error::Error>> {
        let path = PathBuf::from(file_path);

        // Security check: ensure the file is within a .claude directory
        let mut current = path.as_path();
        let mut is_in_claude_dir = false;

        while let Some(parent) = current.parent() {
            if current.file_name() == Some(std::ffi::OsStr::new(".claude")) {
                is_in_claude_dir = true;
                break;
            }
            current = parent;
        }

        if !is_in_claude_dir {
            return Err("File must be within a .claude directory".into());
        }

        // Create parent directories if they don't exist
        if let Some(parent) = path.parent() {
            fs::create_dir_all(parent)?;
        }

        fs::write(&path, content).map_err(|e| e.into())
    }
}
