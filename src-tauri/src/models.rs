use chrono::{DateTime, Utc};
use serde::{Deserialize, Serialize};

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct IdeInfo {
    pub pid: u32,
    pub workspace_folders: Vec<String>,
    pub ide_name: String,
    pub transport: String,
    pub running_in_windows: bool,
    pub auth_token: String,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct ClaudeSession {
    pub session_id: String,
    pub project_path: String,
    pub timestamp: DateTime<Utc>,
    pub message_count: usize,
    pub git_branch: Option<String>,
    pub latest_content_preview: Option<String>,
    pub ide_info: Option<IdeInfo>,
    pub is_processing: bool,
    pub file_modified_time: DateTime<Utc>,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "snake_case")]
pub enum ProcessingStatus {
    Processing,
    Completed,
    Stopped,
    Error,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(tag = "message_type")]
pub enum ClaudeMessage {
    #[serde(rename = "user")]
    User {
        uuid: String,
        parent_uuid: Option<String>,
        session_id: String,
        timestamp: DateTime<Utc>,
        content: MessageContent,
        cwd: String,
        git_branch: Option<String>,
        processing_status: ProcessingStatus,
    },
    #[serde(rename = "assistant")]
    Assistant {
        uuid: String,
        parent_uuid: Option<String>,
        session_id: String,
        timestamp: DateTime<Utc>,
        content: MessageContent,
        cwd: String,
        git_branch: Option<String>,
        processing_status: ProcessingStatus,
        stop_reason: Option<String>,
    },
    #[serde(rename = "summary")]
    Summary {
        summary: String,
        #[serde(rename = "leafUuid")]
        leaf_uuid: String,
    },
}

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(untagged)]
pub enum MessageContent {
    User {
        role: String,
        content: String,
    },
    Assistant {
        role: String,
        content: Vec<ContentBlock>,
    },
}

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(tag = "type")]
pub enum ContentBlock {
    #[serde(rename = "text")]
    Text { text: String },
    #[serde(rename = "tool_use")]
    ToolUse {
        id: String,
        name: String,
        input: serde_json::Value,
    },
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct TodoItem {
    pub id: String,
    pub content: String,
    pub status: TodoStatus,
    pub priority: TodoPriority,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "snake_case")]
pub enum TodoStatus {
    Pending,
    InProgress,
    Completed,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "lowercase")]
pub enum TodoPriority {
    Low,
    Medium,
    High,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct CommandLogEntry {
    pub timestamp: DateTime<Utc>,
    pub user: String,
    pub command: String,
    pub cwd: Option<String>,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct ClaudeSettings {
    #[serde(default)]
    pub permissions: PermissionSettings,
    #[serde(default)]
    pub hooks: HookSettings,
}

impl Default for ClaudeSettings {
    fn default() -> Self {
        Self {
            permissions: PermissionSettings::default(),
            hooks: HookSettings::default(),
        }
    }
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct PermissionSettings {
    #[serde(rename = "defaultMode", default = "default_mode")]
    pub default_mode: String,
    #[serde(default)]
    pub allow: Vec<String>,
    #[serde(default)]
    pub deny: Vec<String>,
}

impl Default for PermissionSettings {
    fn default() -> Self {
        Self {
            default_mode: "prompt".to_string(),
            allow: Vec::new(),
            deny: Vec::new(),
        }
    }
}

fn default_mode() -> String {
    "prompt".to_string()
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct HookSettings {
    #[serde(rename = "PreToolUse", default)]
    pub pre_tool_use: Vec<HookMatcher>,
}

impl Default for HookSettings {
    fn default() -> Self {
        Self {
            pre_tool_use: Vec::new(),
        }
    }
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct HookMatcher {
    pub matcher: String,
    pub hooks: Vec<Hook>,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct Hook {
    #[serde(rename = "type")]
    pub hook_type: String,
    pub command: String,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct ProjectSummary {
    pub project_path: String,
    pub session_count: usize,
    pub last_activity: DateTime<Utc>,
    pub total_messages: usize,
    pub active_todos: usize,
    pub ide_info: Option<IdeInfo>,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct SessionStats {
    pub total_sessions: usize,
    pub total_messages: usize,
    pub total_commands: usize,
    pub active_projects: usize,
    pub pending_todos: usize,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct ClaudeDirectoryInfo {
    pub path: String,
    pub exists: bool,
    pub files: Vec<ClaudeDirectoryFile>,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct ClaudeDirectoryFile {
    pub name: String,
    pub path: String,
    pub size: u64,
    pub modified: DateTime<Utc>,
    pub is_directory: bool,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct CustomCommand {
    pub name: String,
    pub content: String,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct Agent {
    pub name: String,
    pub content: String,
}
