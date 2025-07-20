#[cfg(test)]
mod tests {
    use super::*;
    use crate::claude_data::ClaudeDataManager;
    use crate::models::*;
    use std::fs;
    use tempfile::TempDir;
    use std::path::Path;

    fn create_test_claude_dir() -> TempDir {
        let temp_dir = TempDir::new().unwrap();
        let claude_path = temp_dir.path().join(".claude");
        
        // Create directory structure
        fs::create_dir_all(&claude_path).unwrap();
        fs::create_dir_all(&claude_path.join("projects")).unwrap();
        fs::create_dir_all(&claude_path.join("todos")).unwrap();
        fs::create_dir_all(&claude_path.join("scripts")).unwrap();
        
        temp_dir
    }

    fn create_test_session_file(claude_dir: &Path, project_name: &str, session_id: &str) {
        let project_dir = claude_dir.join("projects").join(project_name);
        fs::create_dir_all(&project_dir).unwrap();
        
        let session_content = r#"{"uuid":"msg1","parentUuid":null,"sessionId":"test-session","timestamp":"2025-07-20T05:00:00.000Z","type":"user","message":{"role":"user","content":"Hello"},"cwd":"/test/path","gitBranch":"main"}
{"uuid":"msg2","parentUuid":"msg1","sessionId":"test-session","timestamp":"2025-07-20T05:01:00.000Z","type":"assistant","message":{"role":"assistant","content":[{"type":"text","text":"Hello! How can I help you?"}]},"cwd":"/test/path","gitBranch":"main"}"#;
        
        let session_file = project_dir.join(format!("{}.jsonl", session_id));
        fs::write(session_file, session_content).unwrap();
    }

    fn create_test_todo_file(claude_dir: &Path, session_id: &str) {
        let todos_content = r#"[
  {
    "id": "1",
    "content": "Test todo item",
    "status": "Pending",
    "priority": "High"
  },
  {
    "id": "2",
    "content": "Another test todo",
    "status": "Completed",
    "priority": "Medium"
  }
]"#;
        
        let todo_file = claude_dir.join("todos").join(format!("{}.json", session_id));
        fs::write(todo_file, todos_content).unwrap();
    }

    fn create_test_settings_file(claude_dir: &Path) {
        let settings_content = r#"{
  "permissions": {
    "defaultMode": "bypassPermissions",
    "allow": ["Bash(find *)"],
    "deny": ["Bash(rm -rf /*)"]
  },
  "hooks": {
    "PreToolUse": [
      {
        "matcher": "Bash",
        "hooks": [
          {
            "type": "command",
            "command": "echo test"
          }
        ]
      }
    ]
  }
}"#;
        
        let settings_file = claude_dir.join("settings.json");
        fs::write(settings_file, settings_content).unwrap();
    }

    fn create_test_command_history(claude_dir: &Path) {
        let command_content = r#"[Sun Jul 20 12:00:00 JST 2025] testuser: ls -la
[Sun Jul 20 12:01:00 JST 2025] testuser: git status
[Sun Jul 20 12:02:00 JST 2025] testuser: npm install"#;
        
        let command_file = claude_dir.join("command_history.log");
        fs::write(command_file, command_content).unwrap();
    }

    #[tokio::test]
    async fn test_claude_data_manager_initialization() {
        let _temp_dir = create_test_claude_dir();
        
        // Test initialization behavior regardless of ~/.claude directory existence
        // In CI environments, ~/.claude may not exist, which is expected behavior
        let result = ClaudeDataManager::new();
        
        // Check if ~/.claude exists in the current environment
        let home = dirs::home_dir().unwrap();
        let claude_dir = home.join(".claude");
        
        if claude_dir.exists() {
            assert!(result.is_ok(), "Expected initialization to succeed with existing ~/.claude directory");
        } else {
            assert!(result.is_err(), "Expected initialization to fail without ~/.claude directory");
        }
    }

    #[tokio::test]
    async fn test_session_parsing() {
        // Test individual session parsing logic
        let session_data = r#"{"uuid":"test","sessionId":"session1","timestamp":"2025-07-20T05:00:00.000Z","type":"user","message":{"role":"user","content":"test"},"cwd":"/test","gitBranch":"main"}"#;
        
        let parsed: Result<serde_json::Value, _> = serde_json::from_str(session_data);
        assert!(parsed.is_ok());
        
        let value = parsed.unwrap();
        assert_eq!(value["type"], "user");
        assert_eq!(value["sessionId"], "session1");
    }

    #[tokio::test]
    async fn test_todo_parsing() {
        let todo_data = r#"[{"id":"1","content":"Test","status":"pending","priority":"high"}]"#;
        
        let parsed: Result<Vec<TodoItem>, _> = serde_json::from_str(todo_data);
        assert!(parsed.is_ok());
        
        let todos = parsed.unwrap();
        assert_eq!(todos.len(), 1);
        assert_eq!(todos[0].content, "Test");
        assert!(matches!(todos[0].status, TodoStatus::Pending));
        assert!(matches!(todos[0].priority, TodoPriority::High));
    }

    #[tokio::test]
    async fn test_settings_parsing() {
        let settings_data = r#"{
            "permissions": {
                "defaultMode": "bypassPermissions",
                "allow": ["test"],
                "deny": ["dangerous"]
            },
            "hooks": {
                "PreToolUse": []
            }
        }"#;
        
        let parsed: Result<ClaudeSettings, _> = serde_json::from_str(settings_data);
        assert!(parsed.is_ok());
        
        let settings = parsed.unwrap();
        assert_eq!(settings.permissions.default_mode, "bypassPermissions");
        assert_eq!(settings.permissions.allow.len(), 1);
        assert_eq!(settings.permissions.deny.len(), 1);
    }

    #[test]
    fn test_message_content_serialization() {
        let user_content = MessageContent::User {
            role: "user".to_string(),
            content: "Hello".to_string(),
        };
        
        let serialized = serde_json::to_string(&user_content);
        assert!(serialized.is_ok());
        
        let assistant_content = MessageContent::Assistant {
            role: "assistant".to_string(),
            content: vec![ContentBlock::Text {
                text: "Hello back!".to_string(),
            }],
        };
        
        let serialized = serde_json::to_string(&assistant_content);
        assert!(serialized.is_ok());
    }

    #[test]
    fn test_project_path_decoding() {
        let encoded_path = "-Users-test-project-path";
        let decoded_path = encoded_path.replace("-", "/");
        assert_eq!(decoded_path, "/Users/test/project/path");
    }

    #[test]
    fn test_todo_status_variants() {
        let pending = TodoStatus::Pending;
        let in_progress = TodoStatus::InProgress;
        let completed = TodoStatus::Completed;
        
        // Test serialization
        assert!(serde_json::to_string(&pending).is_ok());
        assert!(serde_json::to_string(&in_progress).is_ok());
        assert!(serde_json::to_string(&completed).is_ok());
    }

    #[test]
    fn test_todo_priority_variants() {
        let low = TodoPriority::Low;
        let medium = TodoPriority::Medium;
        let high = TodoPriority::High;
        
        // Test serialization
        assert!(serde_json::to_string(&low).is_ok());
        assert!(serde_json::to_string(&medium).is_ok());
        assert!(serde_json::to_string(&high).is_ok());
    }

    #[test]
    fn test_content_block_variants() {
        let text_block = ContentBlock::Text {
            text: "Sample text".to_string(),
        };
        
        let tool_block = ContentBlock::ToolUse {
            id: "tool1".to_string(),
            name: "bash".to_string(),
            input: serde_json::json!({"command": "ls"}),
        };
        
        assert!(serde_json::to_string(&text_block).is_ok());
        assert!(serde_json::to_string(&tool_block).is_ok());
    }

    #[tokio::test]
    async fn test_session_stats_calculation() {
        // Mock data for testing stats calculation
        let sessions = vec![
            ClaudeSession {
                session_id: "s1".to_string(),
                project_path: "/project1".to_string(),
                created_at: chrono::Utc::now(),
                updated_at: chrono::Utc::now(),
                message_count: 10,
                git_branch: Some("main".to_string()),
            },
            ClaudeSession {
                session_id: "s2".to_string(),
                project_path: "/project2".to_string(),
                created_at: chrono::Utc::now(),
                updated_at: chrono::Utc::now(),
                message_count: 5,
                git_branch: Some("dev".to_string()),
            },
        ];
        
        let total_messages: usize = sessions.iter().map(|s| s.message_count).sum();
        assert_eq!(total_messages, 15);
        
        let unique_projects: std::collections::HashSet<_> = 
            sessions.iter().map(|s| &s.project_path).collect();
        assert_eq!(unique_projects.len(), 2);
    }

    #[test]
    fn test_command_log_entry_creation() {
        let entry = CommandLogEntry {
            timestamp: chrono::Utc::now(),
            user: "testuser".to_string(),
            command: "ls -la".to_string(),
            cwd: Some("/test/path".to_string()),
        };
        
        assert_eq!(entry.user, "testuser");
        assert_eq!(entry.command, "ls -la");
        assert!(entry.cwd.is_some());
    }

    #[test]
    fn test_project_summary_creation() {
        let summary = ProjectSummary {
            project_path: "/test/project".to_string(),
            session_count: 5,
            last_activity: chrono::Utc::now(),
            total_messages: 100,
            active_todos: 3,
        };
        
        assert_eq!(summary.session_count, 5);
        assert_eq!(summary.total_messages, 100);
        assert_eq!(summary.active_todos, 3);
    }
}