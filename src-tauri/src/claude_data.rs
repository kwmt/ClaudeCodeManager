use crate::models::*;
use chrono::{DateTime, Utc};
use dirs::home_dir;
use std::collections::HashMap;
use std::fs;
use std::io::{BufRead, BufReader};
use std::path::{Path, PathBuf};
use tokio::sync::RwLock;

pub struct ClaudeDataManager {
    claude_dir: PathBuf,
    _sessions_cache: RwLock<HashMap<String, ClaudeSession>>,
    messages_cache: RwLock<HashMap<String, Vec<ClaudeMessage>>>,
}

impl ClaudeDataManager {
    pub fn new() -> Result<Self, Box<dyn std::error::Error>> {
        let home = home_dir().ok_or("Could not find home directory")?;
        let claude_dir = home.join(".claude");

        if !claude_dir.exists() {
            return Err("~/.claude directory not found".into());
        }

        Ok(Self {
            claude_dir,
            _sessions_cache: RwLock::new(HashMap::new()),
            messages_cache: RwLock::new(HashMap::new()),
        })
    }

    pub async fn get_all_sessions(&self) -> Result<Vec<ClaudeSession>, Box<dyn std::error::Error>> {
        let projects_dir = self.claude_dir.join("projects");
        let mut sessions = Vec::new();

        if !projects_dir.exists() {
            return Ok(sessions);
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

                // Decode project path
                let decoded_path = project_name.replace("-", "/");

                for session_file in fs::read_dir(&project_path)? {
                    let session_file = session_file?;
                    let file_path = session_file.path();

                    if file_path.extension().and_then(|e| e.to_str()) == Some("jsonl") {
                        let session_id = file_path
                            .file_stem()
                            .and_then(|n| n.to_str())
                            .unwrap_or("")
                            .to_string();

                        let session = self
                            .parse_session_file(&file_path, &session_id, &decoded_path)
                            .await?;
                        sessions.push(session);
                    }
                }
            }
        }

        sessions.sort_by(|a, b| b.updated_at.cmp(&a.updated_at));
        Ok(sessions)
    }

    async fn parse_session_file(
        &self,
        file_path: &Path,
        session_id: &str,
        project_path: &str,
    ) -> Result<ClaudeSession, Box<dyn std::error::Error>> {
        let file = fs::File::open(file_path)?;
        let reader = BufReader::new(file);

        let mut message_count = 0;
        let mut created_at: Option<DateTime<Utc>> = None;
        let mut updated_at: Option<DateTime<Utc>> = None;
        let mut git_branch: Option<String> = None;

        for line in reader.lines() {
            let line = line?;
            if let Ok(message) = serde_json::from_str::<serde_json::Value>(&line) {
                message_count += 1;

                if let Some(timestamp_str) = message.get("timestamp").and_then(|t| t.as_str()) {
                    if let Ok(timestamp) = timestamp_str.parse::<DateTime<Utc>>() {
                        if created_at.is_none() || timestamp < created_at.unwrap() {
                            created_at = Some(timestamp);
                        }
                        if updated_at.is_none() || timestamp > updated_at.unwrap() {
                            updated_at = Some(timestamp);
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
            }
        }

        Ok(ClaudeSession {
            session_id: session_id.to_string(),
            project_path: project_path.to_string(),
            created_at: created_at.unwrap_or_else(Utc::now),
            updated_at: updated_at.unwrap_or_else(Utc::now),
            message_count,
            git_branch,
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

        let message_type = match raw.get("type").and_then(|t| t.as_str()) {
            Some("user") => MessageType::User,
            Some("assistant") => MessageType::Assistant,
            _ => return Ok(None),
        };

        let cwd = raw
            .get("cwd")
            .and_then(|c| c.as_str())
            .unwrap_or("")
            .to_string();

        let git_branch = raw
            .get("gitBranch")
            .and_then(|b| b.as_str())
            .map(|s| s.to_string());

        let content = match message_type {
            MessageType::User => {
                let content_text = raw
                    .get("message")
                    .and_then(|m| m.get("content"))
                    .and_then(|c| c.as_str())
                    .unwrap_or("")
                    .to_string();

                MessageContent::User {
                    role: "user".to_string(),
                    content: content_text,
                }
            }
            MessageType::Assistant => {
                let content_blocks = raw
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

                MessageContent::Assistant {
                    role: "assistant".to_string(),
                    content: content_blocks,
                }
            }
        };

        Ok(Some(ClaudeMessage {
            uuid,
            parent_uuid,
            session_id: session_id.to_string(),
            timestamp,
            message_type,
            content,
            cwd,
            git_branch,
        }))
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

                if let Some(colon_pos) = line[end..].find(':') {
                    let absolute_colon_pos = end + colon_pos;
                    
                    // Skip "] " after the timestamp
                    let user_start = if line.len() > end + 2 { 
                        end + 2 
                    } else { 
                        return None 
                    };
                    
                    if absolute_colon_pos > user_start {
                        let user_part = &line[user_start..absolute_colon_pos];
                        let command_start = if line.len() > absolute_colon_pos + 2 { 
                            absolute_colon_pos + 2 
                        } else { 
                            return None 
                        };
                        let command = &line[command_start..];

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

        for session in sessions {
            let entry = project_map
                .entry(session.project_path.clone())
                .or_insert_with(|| ProjectSummary {
                    project_path: session.project_path.clone(),
                    session_count: 0,
                    last_activity: session.updated_at,
                    total_messages: 0,
                    active_todos: 0,
                });

            entry.session_count += 1;
            entry.total_messages += session.message_count;
            if session.updated_at > entry.last_activity {
                entry.last_activity = session.updated_at;
            }
        }

        Ok(project_map.into_values().collect())
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
}
