#[cfg(test)]
mod tests {
    use crate::claude_data::ClaudeDataManager;
    use crate::models::*;
    use chrono::{DateTime, Utc};
    use std::fs;
    use std::path::Path;
    use std::time::SystemTime;
    use tempfile::TempDir;

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
            assert!(
                result.is_ok(),
                "Expected initialization to succeed with existing ~/.claude directory"
            );
        } else {
            assert!(
                result.is_err(),
                "Expected initialization to fail without ~/.claude directory"
            );
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
                timestamp: chrono::Utc::now(),
                message_count: 10,
                git_branch: Some("main".to_string()),
                latest_content_preview: Some("Test session 1 content preview".to_string()),
                ide_info: None,
                is_processing: false,
                file_modified_time: chrono::Utc::now(),
            },
            ClaudeSession {
                session_id: "s2".to_string(),
                project_path: "/project2".to_string(),
                timestamp: chrono::Utc::now(),
                message_count: 5,
                git_branch: Some("dev".to_string()),
                latest_content_preview: Some("Test session 2 content preview".to_string()),
                ide_info: None,
                is_processing: false,
                file_modified_time: chrono::Utc::now(),
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
            ide_info: None,
        };

        assert_eq!(summary.session_count, 5);
        assert_eq!(summary.total_messages, 100);
        assert_eq!(summary.active_todos, 3);
    }

    fn create_realistic_session_file(claude_dir: &Path, project_name: &str, session_id: &str) {
        let project_dir = claude_dir.join("projects").join(project_name);
        fs::create_dir_all(&project_dir).unwrap();

        // 実際のJSONLファイル形式に基づくテストデータ
        let session_content = r#"{"parentUuid":null,"isSidechain":false,"userType":"external","cwd":"/test/project","sessionId":"test-session","version":"1.0.56","gitBranch":"main","type":"user","message":{"role":"user","content":"Hello, how are you?"},"isMeta":false,"uuid":"user-msg-1","timestamp":"2025-07-20T22:56:38.702Z"}
{"parentUuid":"user-msg-1","isSidechain":false,"userType":"external","cwd":"/test/project","sessionId":"test-session","version":"1.0.56","gitBranch":"main","message":{"id":"msg_01","type":"message","role":"assistant","model":"claude-sonnet-4","content":[{"type":"text","text":"Hello! I'm doing well, thank you for asking. How can I help you today?"}],"stop_reason":null,"stop_sequence":null,"usage":{"input_tokens":10,"output_tokens":20,"service_tier":"standard"}},"requestId":"req_01","type":"assistant","uuid":"assistant-msg-1","timestamp":"2025-07-20T22:56:40.000Z"}
{"parentUuid":"assistant-msg-1","isSidechain":false,"userType":"external","cwd":"/test/project","sessionId":"test-session","version":"1.0.56","gitBranch":"main","type":"user","message":{"role":"user","content":"<command-name>ls</command-name>\n<command-message>list files</command-message>\n<command-args>-la</command-args>"},"uuid":"user-cmd-1","timestamp":"2025-07-20T22:57:00.000Z"}
{"parentUuid":"user-cmd-1","isSidechain":false,"userType":"external","cwd":"/test/project","sessionId":"test-session","version":"1.0.56","gitBranch":"main","message":{"id":"msg_02","type":"message","role":"assistant","model":"claude-sonnet-4","content":[{"type":"text","text":"I'll list the files for you."},{"type":"tool_use","id":"tool_01","name":"Bash","input":{"command":"ls -la","description":"List files in current directory"}}],"stop_reason":null,"stop_sequence":null,"usage":{"input_tokens":15,"output_tokens":35,"service_tier":"standard"}},"requestId":"req_02","type":"assistant","uuid":"assistant-tool-1","timestamp":"2025-07-20T22:57:05.000Z"}"#;

        let session_file = project_dir.join(format!("{}.jsonl", session_id));
        fs::write(session_file, session_content).unwrap();
    }

    #[tokio::test]
    async fn test_get_session_messages_content_parsing() {
        let temp_dir = create_test_claude_dir();
        let claude_dir = temp_dir.path().join(".claude");

        // Create realistic session file with various content types
        create_realistic_session_file(&claude_dir, "test-project", "test-session");

        let manager = ClaudeDataManager::new_with_dir(&claude_dir).unwrap();
        let messages = manager.get_session_messages("test-session").await.unwrap();

        assert_eq!(messages.len(), 4);

        // Test user message with simple string content
        let user_msg = &messages[0];
        if let ClaudeMessage::User { content, .. } = user_msg {
            if let MessageContent::User {
                content: user_content,
                ..
            } = content
            {
                assert_eq!(user_content, "Hello, how are you?");
            } else {
                panic!("Expected User message content");
            }
        } else {
            panic!("Expected User message variant");
        }

        // Test assistant message with text content
        let assistant_msg = &messages[1];
        if let ClaudeMessage::Assistant { content, .. } = assistant_msg {
            if let MessageContent::Assistant {
                content: assistant_content,
                ..
            } = content
            {
                assert_eq!(assistant_content.len(), 1);
                if let ContentBlock::Text { text } = &assistant_content[0] {
                    assert_eq!(
                        text,
                        "Hello! I'm doing well, thank you for asking. How can I help you today?"
                    );
                } else {
                    panic!("Expected Text content block");
                }
            } else {
                panic!("Expected Assistant message content");
            }
        } else {
            panic!("Expected Assistant message variant");
        }

        // Test user command message
        let user_cmd = &messages[2];
        if let ClaudeMessage::User { content, .. } = user_cmd {
            if let MessageContent::User {
                content: user_content,
                ..
            } = content
            {
                assert!(user_content.contains("<command-name>ls</command-name>"));
                assert!(user_content.contains("<command-message>list files</command-message>"));
                assert!(user_content.contains("<command-args>-la</command-args>"));
            } else {
                panic!("Expected User command content");
            }
        } else {
            panic!("Expected User message variant");
        }

        // Test assistant message with text and tool_use
        let assistant_tool = &messages[3];
        if let ClaudeMessage::Assistant { content, .. } = assistant_tool {
            if let MessageContent::Assistant {
                content: assistant_content,
                ..
            } = content
            {
                assert_eq!(assistant_content.len(), 2);

                // First block should be text
                if let ContentBlock::Text { text } = &assistant_content[0] {
                    assert_eq!(text, "I'll list the files for you.");
                } else {
                    panic!("Expected Text content block");
                }

                // Second block should be tool_use
                if let ContentBlock::ToolUse { id, name, input } = &assistant_content[1] {
                    assert_eq!(id, "tool_01");
                    assert_eq!(name, "Bash");
                    assert!(input.get("command").is_some());
                    assert_eq!(input["command"], "ls -la");
                } else {
                    panic!("Expected ToolUse content block");
                }
            } else {
                panic!("Expected Assistant message content");
            }
        } else {
            panic!("Expected Assistant message variant");
        }

        // Test metadata fields
        if let ClaudeMessage::User {
            cwd,
            git_branch,
            session_id,
            uuid,
            ..
        } = user_msg
        {
            assert_eq!(cwd, "/test/project");
            assert_eq!(git_branch, &Some("main".to_string()));
            assert_eq!(session_id, "test-session");
            assert!(uuid.starts_with("user-msg"));
        }
    }

    #[tokio::test]
    async fn test_get_session_messages_empty_session() {
        let temp_dir = create_test_claude_dir();
        let claude_dir = temp_dir.path().join(".claude");

        let manager = ClaudeDataManager::new_with_dir(&claude_dir).unwrap();
        let result = manager.get_session_messages("nonexistent-session").await;

        assert!(result.is_err());
        assert!(result
            .unwrap_err()
            .to_string()
            .contains("Session file not found"));
    }

    #[test]
    fn test_content_block_text_extraction() {
        // Test text content block
        let text_block = ContentBlock::Text {
            text: "This is a test message".to_string(),
        };

        if let ContentBlock::Text { text } = text_block {
            assert_eq!(text, "This is a test message");
        }

        // Test tool use content block
        let tool_block = ContentBlock::ToolUse {
            id: "tool_123".to_string(),
            name: "Read".to_string(),
            input: serde_json::json!({
                "file_path": "/test/file.txt",
                "description": "Read test file"
            }),
        };

        if let ContentBlock::ToolUse { id, name, input } = tool_block {
            assert_eq!(id, "tool_123");
            assert_eq!(name, "Read");
            assert_eq!(input["file_path"], "/test/file.txt");
        }
    }

    #[test]
    fn test_message_content_variants() {
        // Test User message content with string
        let user_content = MessageContent::User {
            role: "user".to_string(),
            content: "Simple user message".to_string(),
        };

        if let MessageContent::User { role, content } = user_content {
            assert_eq!(role, "user");
            assert_eq!(content, "Simple user message");
        }

        // Test Assistant message content with blocks
        let assistant_content = MessageContent::Assistant {
            role: "assistant".to_string(),
            content: vec![
                ContentBlock::Text {
                    text: "Assistant response".to_string(),
                },
                ContentBlock::ToolUse {
                    id: "tool_1".to_string(),
                    name: "Bash".to_string(),
                    input: serde_json::json!({"command": "echo test"}),
                },
            ],
        };

        if let MessageContent::Assistant { role, content } = assistant_content {
            assert_eq!(role, "assistant");
            assert_eq!(content.len(), 2);
        }
    }

    fn create_comprehensive_session_file(claude_dir: &Path, project_name: &str, session_id: &str) {
        let project_dir = claude_dir.join("projects").join(project_name);
        fs::create_dir_all(&project_dir).unwrap();

        // すべてのパターンを含む包括的なテストデータ
        let session_content = r#"{"parentUuid":null,"isSidechain":false,"userType":"external","cwd":"/test/project","sessionId":"test-session","version":"1.0.56","gitBranch":"main","type":"user","message":{"role":"user","content":"Hello, how are you?"},"isMeta":false,"uuid":"user-text-1","timestamp":"2025-07-20T22:56:38.702Z"}
{"parentUuid":"user-text-1","isSidechain":false,"userType":"external","cwd":"/test/project","sessionId":"test-session","version":"1.0.56","gitBranch":"main","message":{"role":"assistant","content":[{"type":"text","text":"Hello! I'm doing well, thank you for asking. How can I help you today?"}],"stop_reason":null,"stop_sequence":null,"usage":{"input_tokens":10,"output_tokens":20,"service_tier":"standard"}},"requestId":"req_01","type":"assistant","uuid":"assistant-text-1","timestamp":"2025-07-20T22:56:40.000Z"}
{"parentUuid":"assistant-text-1","isSidechain":false,"userType":"external","cwd":"/test/project","sessionId":"test-session","version":"1.0.56","gitBranch":"main","type":"user","message":{"role":"user","content":"<command-name>ls</command-name>\n<command-message>list files</command-message>\n<command-args>-la</command-args>"},"uuid":"user-command-1","timestamp":"2025-07-20T22:57:00.000Z"}
{"parentUuid":"user-command-1","isSidechain":false,"userType":"external","cwd":"/test/project","sessionId":"test-session","version":"1.0.56","gitBranch":"main","message":{"role":"assistant","content":[{"type":"text","text":"I'll list the files for you."},{"type":"tool_use","id":"tool_01","name":"Bash","input":{"command":"ls -la","description":"List files in current directory"}}],"stop_reason":null,"stop_sequence":null,"usage":{"input_tokens":15,"output_tokens":35,"service_tier":"standard"}},"requestId":"req_02","type":"assistant","uuid":"assistant-tool-1","timestamp":"2025-07-20T22:57:05.000Z"}
{"parentUuid":"assistant-tool-1","isSidechain":false,"userType":"external","cwd":"/test/project","sessionId":"test-session","version":"1.0.56","gitBranch":"main","type":"user","message":{"role":"user","content":[{"tool_use_id":"tool_01","type":"tool_result","content":"total 16\ndrwxr-xr-x  3 user  staff   96 Jul 20 22:57 .\ndrwxr-xr-x  5 user  staff  160 Jul 20 22:56 ..\n-rw-r--r--  1 user  staff  123 Jul 20 22:57 test.txt"}]},"uuid":"user-tool-result-1","timestamp":"2025-07-20T22:57:10.000Z"}
{"parentUuid":"user-tool-result-1","isSidechain":false,"userType":"external","cwd":"/test/project","sessionId":"test-session","version":"1.0.56","gitBranch":"main","type":"system","content":"Command executed successfully","isMeta":false,"timestamp":"2025-07-20T22:57:10.500Z","uuid":"system-info-1","level":"info"}
{"parentUuid":"system-info-1","isSidechain":false,"userType":"external","cwd":"/test/project","sessionId":"test-session","version":"1.0.56","gitBranch":"main","type":"user","message":{"role":"user","content":"<local-command-stdout>File content here</local-command-stdout>"},"uuid":"user-stdout-1","timestamp":"2025-07-20T22:57:15.000Z"}
{"parentUuid":"user-stdout-1","isSidechain":false,"userType":"external","cwd":"/test/project","sessionId":"test-session","version":"1.0.56","gitBranch":"main","message":{"role":"assistant","content":[{"type":"text","text":"I can see the file listing. "},{"type":"text","text":"Let me help you with that."}],"stop_reason":null,"stop_sequence":null,"usage":{"input_tokens":20,"output_tokens":15,"service_tier":"standard"}},"requestId":"req_03","type":"assistant","uuid":"assistant-multi-text-1","timestamp":"2025-07-20T22:57:20.000Z"}
{"parentUuid":"assistant-multi-text-1","isSidechain":false,"userType":"external","cwd":"/test/project","sessionId":"test-session","version":"1.0.56","gitBranch":"main","type":"system","content":"Claude Opus 4 limit reached, now using Sonnet 4","isMeta":false,"timestamp":"2025-07-20T22:57:25.000Z","uuid":"system-warning-1","level":"warning"}"#;

        let session_file = project_dir.join(format!("{}.jsonl", session_id));
        fs::write(session_file, session_content).unwrap();
    }

    #[tokio::test]
    async fn test_get_session_messages_all_patterns() {
        let temp_dir = create_test_claude_dir();
        let claude_dir = temp_dir.path().join(".claude");

        // Create comprehensive session file with all message patterns
        create_comprehensive_session_file(&claude_dir, "test-project", "test-session");

        let manager = ClaudeDataManager::new_with_dir(&claude_dir).unwrap();
        let messages = manager.get_session_messages("test-session").await.unwrap();

        assert_eq!(messages.len(), 7); // システムメッセージは除外されるため

        // Test Pattern 1: User message with simple string content
        let user_text_msg = &messages[0];
        if let ClaudeMessage::User { uuid, content, .. } = user_text_msg {
            assert_eq!(uuid, "user-text-1");
            if let MessageContent::User {
                content: user_content,
                ..
            } = content
            {
                assert_eq!(user_content, "Hello, how are you?");
            } else {
                panic!("Expected User message content");
            }
        } else {
            panic!("Expected User message variant");
        }

        // Test Pattern 2: Assistant message with single text block
        let assistant_text_msg = &messages[1];
        if let ClaudeMessage::Assistant { uuid, content, .. } = assistant_text_msg {
            assert_eq!(uuid, "assistant-text-1");
            if let MessageContent::Assistant {
                content: assistant_content,
                ..
            } = content
            {
                assert_eq!(assistant_content.len(), 1);
                if let ContentBlock::Text { text } = &assistant_content[0] {
                    assert_eq!(
                        text,
                        "Hello! I'm doing well, thank you for asking. How can I help you today?"
                    );
                } else {
                    panic!("Expected Text content block");
                }
            } else {
                panic!("Expected Assistant message content");
            }
        } else {
            panic!("Expected Assistant message variant");
        }

        // Test Pattern 3: User command message with XML tags
        let user_command_msg = &messages[2];
        if let ClaudeMessage::User { uuid, content, .. } = user_command_msg {
            assert_eq!(uuid, "user-command-1");
            if let MessageContent::User {
                content: user_content,
                ..
            } = content
            {
                assert!(user_content.contains("<command-name>ls</command-name>"));
                assert!(user_content.contains("<command-message>list files</command-message>"));
                assert!(user_content.contains("<command-args>-la</command-args>"));
            } else {
                panic!("Expected User command content");
            }
        } else {
            panic!("Expected User message variant");
        }

        // Test Pattern 4: Assistant message with text + tool_use
        let assistant_tool_msg = &messages[3];
        if let ClaudeMessage::Assistant { uuid, content, .. } = assistant_tool_msg {
            assert_eq!(uuid, "assistant-tool-1");
            if let MessageContent::Assistant {
                content: assistant_content,
                ..
            } = content
            {
                assert_eq!(assistant_content.len(), 2);

                // First block: text
                if let ContentBlock::Text { text } = &assistant_content[0] {
                    assert_eq!(text, "I'll list the files for you.");
                } else {
                    panic!("Expected Text content block");
                }

                // Second block: tool_use
                if let ContentBlock::ToolUse { id, name, input } = &assistant_content[1] {
                    assert_eq!(id, "tool_01");
                    assert_eq!(name, "Bash");
                    assert_eq!(input["command"], "ls -la");
                    assert_eq!(input["description"], "List files in current directory");
                } else {
                    panic!("Expected ToolUse content block");
                }
            } else {
                panic!("Expected Assistant message content");
            }
        } else {
            panic!("Expected Assistant message variant");
        }

        // Test Pattern 5: User message with tool_result (現在の実装では配列contentは空文字列として処理される)
        let user_tool_result_msg = &messages[4];
        if let ClaudeMessage::User { uuid, content, .. } = user_tool_result_msg {
            assert_eq!(uuid, "user-tool-result-1");
            if let MessageContent::User {
                content: user_content,
                ..
            } = content
            {
                // 現在の実装では配列contentは文字列として抽出できないため空文字列になる
                assert_eq!(user_content, "");
            } else {
                panic!("Expected User tool result content");
            }
        } else {
            panic!("Expected User message variant");
        }

        // Test Pattern 6: System message (skipped in parsing but verify other messages)
        // System messages are filtered out in parse_message_line, so we check the next user message

        // Test Pattern 6: User message with local command output
        let user_stdout_msg = &messages[5];
        if let ClaudeMessage::User { uuid, content, .. } = user_stdout_msg {
            assert_eq!(uuid, "user-stdout-1");
            if let MessageContent::User {
                content: user_content,
                ..
            } = content
            {
                assert!(user_content
                    .contains("<local-command-stdout>File content here</local-command-stdout>"));
            } else {
                panic!("Expected User stdout content");
            }
        } else {
            panic!("Expected User message variant");
        }

        // Test Pattern 7: Assistant message with multiple text blocks
        let assistant_multi_msg = &messages[6];
        if let ClaudeMessage::Assistant { uuid, content, .. } = assistant_multi_msg {
            assert_eq!(uuid, "assistant-multi-text-1");
            if let MessageContent::Assistant {
                content: assistant_content,
                ..
            } = content
            {
                assert_eq!(assistant_content.len(), 2);

                if let ContentBlock::Text { text } = &assistant_content[0] {
                    assert_eq!(text, "I can see the file listing. ");
                } else {
                    panic!("Expected first Text content block");
                }

                if let ContentBlock::Text { text } = &assistant_content[1] {
                    assert_eq!(text, "Let me help you with that.");
                } else {
                    panic!("Expected second Text content block");
                }
            } else {
                panic!("Expected Assistant multi-text content");
            }
        } else {
            panic!("Expected Assistant message variant");
        }

        // Verify metadata for all messages
        for message in &messages {
            match message {
                ClaudeMessage::User {
                    session_id,
                    cwd,
                    git_branch,
                    uuid,
                    ..
                }
                | ClaudeMessage::Assistant {
                    session_id,
                    cwd,
                    git_branch,
                    uuid,
                    ..
                } => {
                    assert_eq!(session_id, "test-session");
                    assert_eq!(cwd, "/test/project");
                    assert_eq!(git_branch, &Some("main".to_string()));
                    assert!(!uuid.is_empty());
                }
                ClaudeMessage::Summary { .. } => {
                    // Summary messages don't have the same metadata fields
                }
            }
        }
    }

    #[tokio::test]
    async fn test_get_session_messages_user_content_patterns() {
        let temp_dir = create_test_claude_dir();
        let claude_dir = temp_dir.path().join(".claude");

        let project_dir = claude_dir.join("projects").join("user-content-test");
        fs::create_dir_all(&project_dir).unwrap();

        // Test different user content patterns
        let user_content_session = r#"{"type":"user","message":{"role":"user","content":"Simple text message"},"uuid":"user-1","timestamp":"2025-07-20T22:56:38.702Z","sessionId":"user-test","cwd":"/test","gitBranch":"main"}
{"type":"user","message":{"role":"user","content":"Message with\nmultiple\nlines"},"uuid":"user-2","timestamp":"2025-07-20T22:56:39.702Z","sessionId":"user-test","cwd":"/test","gitBranch":"main"}
{"type":"user","message":{"role":"user","content":"<command-name>git</command-name>\n<command-message>check status</command-message>\n<command-args>status --porcelain</command-args>"},"uuid":"user-3","timestamp":"2025-07-20T22:56:40.702Z","sessionId":"user-test","cwd":"/test","gitBranch":"main"}
{"type":"user","message":{"role":"user","content":"<local-command-stdout>?? new_file.txt\n M modified_file.txt</local-command-stdout>"},"uuid":"user-4","timestamp":"2025-07-20T22:56:41.702Z","sessionId":"user-test","cwd":"/test","gitBranch":"main"}"#;

        let session_file = project_dir.join("user-test.jsonl");
        fs::write(session_file, user_content_session).unwrap();

        let manager = ClaudeDataManager::new_with_dir(&claude_dir).unwrap();
        let messages = manager.get_session_messages("user-test").await.unwrap();

        assert_eq!(messages.len(), 4);

        // Simple text
        if let ClaudeMessage::User { content, .. } = &messages[0] {
            if let MessageContent::User {
                content: user_content,
                ..
            } = content
            {
                assert_eq!(user_content, "Simple text message");
            }
        }

        // Multiline text
        if let ClaudeMessage::User { content, .. } = &messages[1] {
            if let MessageContent::User {
                content: user_content,
                ..
            } = content
            {
                assert_eq!(user_content, "Message with\nmultiple\nlines");
            }
        }

        // Command with XML
        if let ClaudeMessage::User { content, .. } = &messages[2] {
            if let MessageContent::User {
                content: user_content,
                ..
            } = content
            {
                assert!(user_content.contains("git"));
                assert!(user_content.contains("check status"));
                assert!(user_content.contains("status --porcelain"));
            }
        }

        // Local command output
        if let ClaudeMessage::User { content, .. } = &messages[3] {
            if let MessageContent::User {
                content: user_content,
                ..
            } = content
            {
                assert!(user_content.contains("new_file.txt"));
                assert!(user_content.contains("modified_file.txt"));
            }
        }
    }

    #[tokio::test]
    async fn test_get_session_messages_assistant_content_patterns() {
        let temp_dir = create_test_claude_dir();
        let claude_dir = temp_dir.path().join(".claude");

        let project_dir = claude_dir.join("projects").join("assistant-content-test");
        fs::create_dir_all(&project_dir).unwrap();

        // Test different assistant content patterns
        let assistant_content_session = r#"{"type":"assistant","message":{"role":"assistant","content":[{"type":"text","text":"Simple assistant response"}]},"uuid":"assistant-1","timestamp":"2025-07-20T22:56:38.702Z","sessionId":"assistant-test","cwd":"/test","gitBranch":"main"}
{"type":"assistant","message":{"role":"assistant","content":[{"type":"text","text":"Response with "},{"type":"text","text":"multiple text blocks"}]},"uuid":"assistant-2","timestamp":"2025-07-20T22:56:39.702Z","sessionId":"assistant-test","cwd":"/test","gitBranch":"main"}
{"type":"assistant","message":{"role":"assistant","content":[{"type":"tool_use","id":"tool123","name":"Read","input":{"file_path":"/test/file.txt"}}]},"uuid":"assistant-3","timestamp":"2025-07-20T22:56:40.702Z","sessionId":"assistant-test","cwd":"/test","gitBranch":"main"}
{"type":"assistant","message":{"role":"assistant","content":[{"type":"text","text":"I'll read the file."},{"type":"tool_use","id":"tool124","name":"Bash","input":{"command":"cat file.txt","description":"Read file content"}}]},"uuid":"assistant-4","timestamp":"2025-07-20T22:56:41.702Z","sessionId":"assistant-test","cwd":"/test","gitBranch":"main"}"#;

        let session_file = project_dir.join("assistant-test.jsonl");
        fs::write(session_file, assistant_content_session).unwrap();

        let manager = ClaudeDataManager::new_with_dir(&claude_dir).unwrap();
        let messages = manager
            .get_session_messages("assistant-test")
            .await
            .unwrap();

        assert_eq!(messages.len(), 4);

        // Single text block
        if let ClaudeMessage::Assistant { content, .. } = &messages[0] {
            if let MessageContent::Assistant {
                content: assistant_content,
                ..
            } = content
            {
                assert_eq!(assistant_content.len(), 1);
                if let ContentBlock::Text { text } = &assistant_content[0] {
                    assert_eq!(text, "Simple assistant response");
                }
            }
        }

        // Multiple text blocks
        if let ClaudeMessage::Assistant { content, .. } = &messages[1] {
            if let MessageContent::Assistant {
                content: assistant_content,
                ..
            } = content
            {
                assert_eq!(assistant_content.len(), 2);
                if let ContentBlock::Text { text } = &assistant_content[0] {
                    assert_eq!(text, "Response with ");
                }
                if let ContentBlock::Text { text } = &assistant_content[1] {
                    assert_eq!(text, "multiple text blocks");
                }
            }
        }

        // Single tool use
        if let ClaudeMessage::Assistant { content, .. } = &messages[2] {
            if let MessageContent::Assistant {
                content: assistant_content,
                ..
            } = content
            {
                assert_eq!(assistant_content.len(), 1);
                if let ContentBlock::ToolUse { id, name, input } = &assistant_content[0] {
                    assert_eq!(id, "tool123");
                    assert_eq!(name, "Read");
                    assert_eq!(input["file_path"], "/test/file.txt");
                }
            }
        }

        // Text + tool use combination
        if let ClaudeMessage::Assistant { content, .. } = &messages[3] {
            if let MessageContent::Assistant {
                content: assistant_content,
                ..
            } = content
            {
                assert_eq!(assistant_content.len(), 2);
                if let ContentBlock::Text { text } = &assistant_content[0] {
                    assert_eq!(text, "I'll read the file.");
                }
                if let ContentBlock::ToolUse { id, name, input } = &assistant_content[1] {
                    assert_eq!(id, "tool124");
                    assert_eq!(name, "Bash");
                    assert_eq!(input["command"], "cat file.txt");
                }
            }
        }
    }

    #[tokio::test]
    async fn test_get_session_messages_system_messages_filtered() {
        let temp_dir = create_test_claude_dir();
        let claude_dir = temp_dir.path().join(".claude");

        let project_dir = claude_dir.join("projects").join("system-test");
        fs::create_dir_all(&project_dir).unwrap();

        // Test that system messages are filtered out
        let system_messages_session = r#"{"type":"user","message":{"role":"user","content":"Hello"},"uuid":"user-1","timestamp":"2025-07-20T22:56:38.702Z","sessionId":"system-test","cwd":"/test","gitBranch":"main"}
{"type":"system","content":"Model change notification","uuid":"system-1","timestamp":"2025-07-20T22:56:39.702Z","sessionId":"system-test","cwd":"/test","gitBranch":"main","level":"info"}
{"type":"assistant","message":{"role":"assistant","content":[{"type":"text","text":"Hello back!"}]},"uuid":"assistant-1","timestamp":"2025-07-20T22:56:40.702Z","sessionId":"system-test","cwd":"/test","gitBranch":"main"}
{"type":"system","content":"Command hook executed","uuid":"system-2","timestamp":"2025-07-20T22:56:41.702Z","sessionId":"system-test","cwd":"/test","gitBranch":"main","level":"warning"}"#;

        let session_file = project_dir.join("system-test.jsonl");
        fs::write(session_file, system_messages_session).unwrap();

        let manager = ClaudeDataManager::new_with_dir(&claude_dir).unwrap();
        let messages = manager.get_session_messages("system-test").await.unwrap();

        // Only user and assistant messages should be included, system messages filtered out
        assert_eq!(messages.len(), 2);

        if let ClaudeMessage::User { uuid, .. } = &messages[0] {
            assert_eq!(uuid, "user-1");
        } else {
            panic!("Expected User message variant");
        }

        if let ClaudeMessage::Assistant { uuid, .. } = &messages[1] {
            assert_eq!(uuid, "assistant-1");
        } else {
            panic!("Expected Assistant message variant");
        }
    }

    #[tokio::test]
    async fn test_get_session_messages_edge_cases() {
        let temp_dir = create_test_claude_dir();
        let claude_dir = temp_dir.path().join(".claude");

        let project_dir = claude_dir.join("projects").join("edge-case-test");
        fs::create_dir_all(&project_dir).unwrap();

        // Test edge cases: empty content, missing fields, malformed JSON
        let edge_cases_session = r#"{"type":"user","message":{"role":"user","content":""},"uuid":"user-empty","timestamp":"2025-07-20T22:56:38.702Z","sessionId":"edge-test","cwd":"/test","gitBranch":"main"}
{"type":"assistant","message":{"role":"assistant","content":[]},"uuid":"assistant-empty","timestamp":"2025-07-20T22:56:39.702Z","sessionId":"edge-test","cwd":"/test","gitBranch":"main"}
{"type":"user","message":{"role":"user","content":"Valid message"},"uuid":"user-valid","timestamp":"2025-07-20T22:56:40.702Z","sessionId":"edge-test","cwd":"/test","gitBranch":"main"}
{"type":"assistant","message":{"role":"assistant","content":[{"type":"text","text":""},{"type":"tool_use","id":"","name":"","input":{}}]},"uuid":"assistant-edge","timestamp":"2025-07-20T22:56:41.702Z","sessionId":"edge-test","cwd":"/test","gitBranch":"main"}"#;

        let session_file = project_dir.join("edge-test.jsonl");
        fs::write(session_file, edge_cases_session).unwrap();

        let manager = ClaudeDataManager::new_with_dir(&claude_dir).unwrap();
        let messages = manager.get_session_messages("edge-test").await.unwrap();

        assert_eq!(messages.len(), 4);

        // Empty user content
        if let ClaudeMessage::User { content, .. } = &messages[0] {
            if let MessageContent::User {
                content: user_content,
                ..
            } = content
            {
                assert_eq!(user_content, "");
            }
        }

        // Empty assistant content array
        if let ClaudeMessage::Assistant { content, .. } = &messages[1] {
            if let MessageContent::Assistant {
                content: assistant_content,
                ..
            } = content
            {
                assert_eq!(assistant_content.len(), 0);
            }
        }

        // Valid user message
        if let ClaudeMessage::User { content, .. } = &messages[2] {
            if let MessageContent::User {
                content: user_content,
                ..
            } = content
            {
                assert_eq!(user_content, "Valid message");
            }
        }

        // Assistant with empty text and tool_use blocks
        if let ClaudeMessage::Assistant { content, .. } = &messages[3] {
            if let MessageContent::Assistant {
                content: assistant_content,
                ..
            } = content
            {
                assert_eq!(assistant_content.len(), 2);

                if let ContentBlock::Text { text } = &assistant_content[0] {
                    assert_eq!(text, "");
                }

                if let ContentBlock::ToolUse { id, name, .. } = &assistant_content[1] {
                    assert_eq!(id, "");
                    assert_eq!(name, "");
                }
            }
        }
    }

    #[tokio::test]
    async fn test_get_session_messages_special_characters() {
        let temp_dir = create_test_claude_dir();
        let claude_dir = temp_dir.path().join(".claude");

        let project_dir = claude_dir.join("projects").join("special-chars-test");
        fs::create_dir_all(&project_dir).unwrap();

        // Test special characters, Unicode, escape sequences
        let special_chars_session = r#"{"type":"user","message":{"role":"user","content":"Message with 日本語 and émojis 🚀"},"uuid":"user-unicode","timestamp":"2025-07-20T22:56:38.702Z","sessionId":"special-test","cwd":"/test","gitBranch":"main"}
{"type":"user","message":{"role":"user","content":"JSON with \"quotes\" and \\backslashes\\"},"uuid":"user-escapes","timestamp":"2025-07-20T22:56:39.702Z","sessionId":"special-test","cwd":"/test","gitBranch":"main"}
{"type":"assistant","message":{"role":"assistant","content":[{"type":"text","text":"Response with\nnewlines\tand\ttabs"}]},"uuid":"assistant-formatting","timestamp":"2025-07-20T22:56:40.702Z","sessionId":"special-test","cwd":"/test","gitBranch":"main"}"#;

        let session_file = project_dir.join("special-test.jsonl");
        fs::write(session_file, special_chars_session).unwrap();

        let manager = ClaudeDataManager::new_with_dir(&claude_dir).unwrap();
        let messages = manager.get_session_messages("special-test").await.unwrap();

        assert_eq!(messages.len(), 3);

        // Unicode characters
        if let ClaudeMessage::User { content, .. } = &messages[0] {
            if let MessageContent::User {
                content: user_content,
                ..
            } = content
            {
                assert!(user_content.contains("日本語"));
                assert!(user_content.contains("émojis"));
                assert!(user_content.contains("🚀"));
            }
        }

        // Escaped characters
        if let ClaudeMessage::User { content, .. } = &messages[1] {
            if let MessageContent::User {
                content: user_content,
                ..
            } = content
            {
                assert!(user_content.contains("\"quotes\""));
                assert!(user_content.contains("\\backslashes\\"));
            }
        }

        // Newlines and tabs
        if let ClaudeMessage::Assistant { content, .. } = &messages[2] {
            if let MessageContent::Assistant {
                content: assistant_content,
                ..
            } = content
            {
                if let ContentBlock::Text { text } = &assistant_content[0] {
                    assert!(text.contains("\n"));
                    assert!(text.contains("\t"));
                }
            }
        }
    }

    #[tokio::test]
    async fn test_get_session_messages_message_patterns() {
        let temp_dir = create_test_claude_dir();
        let claude_dir = temp_dir.path().join(".claude");

        let project_dir = claude_dir.join("projects").join("message-patterns-test");
        fs::create_dir_all(&project_dir).unwrap();

        // Test different message field patterns
        let message_patterns_session = r#"{"type":"user","message":{"role":"user","content":"Message with object"},"uuid":"user-msg-object","timestamp":"2025-07-20T22:56:38.702Z","sessionId":"message-test","cwd":"/test","gitBranch":"main"}
{"type":"assistant","message":{"role":"assistant","content":[{"type":"text","text":"Assistant with object message"}]},"uuid":"assistant-msg-object","timestamp":"2025-07-20T22:56:39.702Z","sessionId":"message-test","cwd":"/test","gitBranch":"main"}
{"type":"system","content":"System message without message field","uuid":"system-no-msg","timestamp":"2025-07-20T22:56:40.702Z","sessionId":"message-test","cwd":"/test","gitBranch":"main","level":"info"}"#;

        let session_file = project_dir.join("message-test.jsonl");
        fs::write(session_file, message_patterns_session).unwrap();

        let manager = ClaudeDataManager::new_with_dir(&claude_dir).unwrap();
        let messages = manager.get_session_messages("message-test").await.unwrap();

        // System messages are filtered out, so we have 2 messages
        assert_eq!(messages.len(), 2);

        // User message with object message field
        if let ClaudeMessage::User { uuid, content, .. } = &messages[0] {
            assert_eq!(uuid, "user-msg-object");
            if let MessageContent::User {
                content: user_content,
                ..
            } = content
            {
                assert_eq!(user_content, "Message with object");
            }
        } else {
            panic!("Expected User message variant");
        }

        // Assistant message with object message field
        if let ClaudeMessage::Assistant { uuid, content, .. } = &messages[1] {
            assert_eq!(uuid, "assistant-msg-object");
            if let MessageContent::Assistant {
                content: assistant_content,
                ..
            } = content
            {
                assert_eq!(assistant_content.len(), 1);
                if let ContentBlock::Text { text } = &assistant_content[0] {
                    assert_eq!(text, "Assistant with object message");
                }
            }
        } else {
            panic!("Expected Assistant message variant");
        }
    }

    #[tokio::test]
    async fn test_get_session_messages_content_patterns() {
        let temp_dir = create_test_claude_dir();
        let claude_dir = temp_dir.path().join(".claude");

        let project_dir = claude_dir.join("projects").join("content-patterns-test");
        fs::create_dir_all(&project_dir).unwrap();

        // Test different content patterns: string vs array
        let content_patterns_session = r#"{"type":"user","message":{"role":"user","content":"String content for user"},"uuid":"user-string-content","timestamp":"2025-07-20T22:56:38.702Z","sessionId":"content-test","cwd":"/test","gitBranch":"main"}
{"type":"user","message":{"role":"user","content":[{"tool_use_id":"tool_123","type":"tool_result","content":"Tool result content"}]},"uuid":"user-array-content","timestamp":"2025-07-20T22:56:39.702Z","sessionId":"content-test","cwd":"/test","gitBranch":"main"}
{"type":"assistant","message":{"role":"assistant","content":[{"type":"text","text":"Assistant array content"}]},"uuid":"assistant-array-content","timestamp":"2025-07-20T22:56:40.702Z","sessionId":"content-test","cwd":"/test","gitBranch":"main"}
{"type":"assistant","message":{"role":"assistant","content":[{"type":"text","text":"First part"},{"type":"text","text":"Second part"}]},"uuid":"assistant-multi-array","timestamp":"2025-07-20T22:56:41.702Z","sessionId":"content-test","cwd":"/test","gitBranch":"main"}"#;

        let session_file = project_dir.join("content-test.jsonl");
        fs::write(session_file, content_patterns_session).unwrap();

        let manager = ClaudeDataManager::new_with_dir(&claude_dir).unwrap();
        let messages = manager.get_session_messages("content-test").await.unwrap();

        assert_eq!(messages.len(), 4);

        // Pattern 1: User message with string content
        if let ClaudeMessage::User { uuid, content, .. } = &messages[0] {
            assert_eq!(uuid, "user-string-content");
            if let MessageContent::User {
                content: user_content,
                ..
            } = content
            {
                assert_eq!(user_content, "String content for user");
            }
        } else {
            panic!("Expected User message variant");
        }

        // Pattern 2: User message with array content (現在の実装では空文字列)
        if let ClaudeMessage::User { uuid, content, .. } = &messages[1] {
            assert_eq!(uuid, "user-array-content");
            if let MessageContent::User {
                content: user_content,
                ..
            } = content
            {
                // 現在の実装では配列contentは文字列として抽出できない
                assert_eq!(user_content, "");
            }
        } else {
            panic!("Expected User message variant");
        }

        // Pattern 3: Assistant message with single array content
        if let ClaudeMessage::Assistant { uuid, content, .. } = &messages[2] {
            assert_eq!(uuid, "assistant-array-content");
            if let MessageContent::Assistant {
                content: assistant_content,
                ..
            } = content
            {
                assert_eq!(assistant_content.len(), 1);
                if let ContentBlock::Text { text } = &assistant_content[0] {
                    assert_eq!(text, "Assistant array content");
                }
            }
        } else {
            panic!("Expected Assistant message variant");
        }

        // Pattern 4: Assistant message with multiple array content
        if let ClaudeMessage::Assistant { uuid, content, .. } = &messages[3] {
            assert_eq!(uuid, "assistant-multi-array");
            if let MessageContent::Assistant {
                content: assistant_content,
                ..
            } = content
            {
                assert_eq!(assistant_content.len(), 2);
                if let ContentBlock::Text { text } = &assistant_content[0] {
                    assert_eq!(text, "First part");
                }
                if let ContentBlock::Text { text } = &assistant_content[1] {
                    assert_eq!(text, "Second part");
                }
            }
        } else {
            panic!("Expected Assistant message variant");
        }
    }

    #[tokio::test]
    async fn test_get_session_messages_malformed_entries() {
        let temp_dir = create_test_claude_dir();
        let claude_dir = temp_dir.path().join(".claude");

        let project_dir = claude_dir.join("projects").join("malformed-test");
        fs::create_dir_all(&project_dir).unwrap();

        // Test malformed/missing required fields
        let malformed_session = r#"{"type":"user","message":{"role":"user","content":"Good message"},"uuid":"user-good","timestamp":"2025-07-20T22:56:38.702Z","sessionId":"malformed-test","cwd":"/test","gitBranch":"main"}
{"type":"user","uuid":"user-no-message","timestamp":"2025-07-20T22:56:39.702Z","sessionId":"malformed-test","cwd":"/test","gitBranch":"main"}
{"type":"user","message":{"role":"user"},"uuid":"user-no-content","timestamp":"2025-07-20T22:56:40.702Z","sessionId":"malformed-test","cwd":"/test","gitBranch":"main"}
{"type":"assistant","message":{"role":"assistant","content":[{"type":"text","text":"Valid assistant"}]},"uuid":"assistant-good","timestamp":"2025-07-20T22:56:41.702Z","sessionId":"malformed-test","cwd":"/test","gitBranch":"main"}
{"uuid":"missing-type","timestamp":"2025-07-20T22:56:42.702Z","sessionId":"malformed-test","cwd":"/test","gitBranch":"main"}
{"type":"unknown","message":{"role":"unknown","content":"Unknown type"},"uuid":"unknown-type","timestamp":"2025-07-20T22:56:43.702Z","sessionId":"malformed-test","cwd":"/test","gitBranch":"main"}"#;

        let session_file = project_dir.join("malformed-test.jsonl");
        fs::write(session_file, malformed_session).unwrap();

        let manager = ClaudeDataManager::new_with_dir(&claude_dir).unwrap();
        let messages = manager
            .get_session_messages("malformed-test")
            .await
            .unwrap();

        // Only valid messages should be parsed (malformed ones are skipped)
        assert_eq!(messages.len(), 4);

        // Good user message
        if let ClaudeMessage::User { uuid, content, .. } = &messages[0] {
            assert_eq!(uuid, "user-good");
            if let MessageContent::User {
                content: user_content,
                ..
            } = content
            {
                assert_eq!(user_content, "Good message");
            }
        } else {
            panic!("Expected User message variant");
        }

        // User with no message field - content becomes empty
        if let ClaudeMessage::User { uuid, content, .. } = &messages[1] {
            assert_eq!(uuid, "user-no-message");
            if let MessageContent::User {
                content: user_content,
                ..
            } = content
            {
                assert_eq!(user_content, "");
            }
        } else {
            panic!("Expected User message variant");
        }

        // User with no content field - content becomes empty
        if let ClaudeMessage::User { uuid, content, .. } = &messages[2] {
            assert_eq!(uuid, "user-no-content");
            if let MessageContent::User {
                content: user_content,
                ..
            } = content
            {
                assert_eq!(user_content, "");
            }
        } else {
            panic!("Expected User message variant");
        }

        // Good assistant message
        if let ClaudeMessage::Assistant { uuid, content, .. } = &messages[3] {
            assert_eq!(uuid, "assistant-good");
            if let MessageContent::Assistant {
                content: assistant_content,
                ..
            } = content
            {
                assert_eq!(assistant_content.len(), 1);
            }
        } else {
            panic!("Expected Assistant message variant");
        }

        // Entries with missing type or unknown type should be filtered out
        // So we don't see "missing-type" or "unknown-type" in the results
    }

    #[tokio::test]
    async fn test_get_session_messages_complex_content_structures() {
        let temp_dir = create_test_claude_dir();
        let claude_dir = temp_dir.path().join(".claude");

        let project_dir = claude_dir.join("projects").join("complex-content-test");
        fs::create_dir_all(&project_dir).unwrap();

        // Test complex nested content structures
        let complex_content_session = r#"{"type":"user","message":{"role":"user","content":[{"tool_use_id":"tool_456","type":"tool_result","content":"Complex tool result with\nmultiple lines\nand special chars: {}\n[]\"'"}]},"uuid":"user-complex-tool-result","timestamp":"2025-07-20T22:56:38.702Z","sessionId":"complex-test","cwd":"/test","gitBranch":"main"}
{"type":"assistant","message":{"role":"assistant","content":[{"type":"text","text":"Processing complex data:"},{"type":"tool_use","id":"tool_789","name":"MultiEdit","input":{"file_path":"/test/file.txt","edits":[{"old_string":"old","new_string":"new"}]}},{"type":"text","text":"Done!"}]},"uuid":"assistant-complex-mix","timestamp":"2025-07-20T22:56:39.702Z","sessionId":"complex-test","cwd":"/test","gitBranch":"main"}"#;

        let session_file = project_dir.join("complex-test.jsonl");
        fs::write(session_file, complex_content_session).unwrap();

        let manager = ClaudeDataManager::new_with_dir(&claude_dir).unwrap();
        let messages = manager.get_session_messages("complex-test").await.unwrap();

        assert_eq!(messages.len(), 2);

        // Complex user tool result (現在の実装では配列contentは空文字列)
        if let ClaudeMessage::User { uuid, content, .. } = &messages[0] {
            assert_eq!(uuid, "user-complex-tool-result");
            if let MessageContent::User {
                content: user_content,
                ..
            } = content
            {
                // 配列形式のcontentは現在の実装では処理されない
                assert_eq!(user_content, "");
            }
        } else {
            panic!("Expected User message variant");
        }

        // Complex assistant with mixed content
        if let ClaudeMessage::Assistant { uuid, content, .. } = &messages[1] {
            assert_eq!(uuid, "assistant-complex-mix");
            if let MessageContent::Assistant {
                content: assistant_content,
                ..
            } = content
            {
                assert_eq!(assistant_content.len(), 3);

                // First: text
                if let ContentBlock::Text { text } = &assistant_content[0] {
                    assert_eq!(text, "Processing complex data:");
                }

                // Second: complex tool_use with nested JSON
                if let ContentBlock::ToolUse { id, name, input } = &assistant_content[1] {
                    assert_eq!(id, "tool_789");
                    assert_eq!(name, "MultiEdit");
                    assert!(input.get("file_path").is_some());
                    assert!(input.get("edits").is_some());
                }

                // Third: text
                if let ContentBlock::Text { text } = &assistant_content[2] {
                    assert_eq!(text, "Done!");
                }
            }
        } else {
            panic!("Expected Assistant message variant");
        }
    }

    #[tokio::test]
    async fn test_file_modified_time_in_sessions() {
        let temp_dir = create_test_claude_dir();
        let claude_dir = temp_dir.path().join(".claude");

        let project_dir = claude_dir.join("projects").join("time-test-project");
        fs::create_dir_all(&project_dir).unwrap();

        // Create a test session file
        let session_content = r#"{"type":"user","message":{"role":"user","content":"Test message"},"uuid":"test-user","timestamp":"2025-07-20T22:56:38.702Z","sessionId":"time-test","cwd":"/test/path","gitBranch":"main"}"#;
        let session_file = project_dir.join("time-test.jsonl");
        fs::write(&session_file, session_content).unwrap();

        // Get the file's modification time before parsing
        let expected_mod_time = fs::metadata(&session_file).unwrap().modified().unwrap();
        let expected_datetime = DateTime::<Utc>::from(expected_mod_time);

        let manager = ClaudeDataManager::new_with_dir(&claude_dir).unwrap();
        let sessions = manager.get_all_sessions().await.unwrap();

        assert_eq!(sessions.len(), 1);
        let session = &sessions[0];

        // Verify that file_modified_time is set correctly
        assert_eq!(session.session_id, "time-test");
        assert_eq!(session.project_path, "/test/path");

        // The file_modified_time should be close to when we created the file
        let time_diff = (session.file_modified_time - expected_datetime)
            .num_seconds()
            .abs();
        assert!(
            time_diff <= 2,
            "File modification time should be within 2 seconds of expected time"
        );
    }

    #[tokio::test]
    async fn test_project_summary_last_activity_from_file_modified_time() {
        let temp_dir = create_test_claude_dir();
        let claude_dir = temp_dir.path().join(".claude");

        // Create two projects with different modification times
        let project1_dir = claude_dir.join("projects").join("project1");
        let project2_dir = claude_dir.join("projects").join("project2");
        fs::create_dir_all(&project1_dir).unwrap();
        fs::create_dir_all(&project2_dir).unwrap();

        // Create session files with some delay between them
        let session1_content = r#"{"type":"user","message":{"role":"user","content":"Project 1 message"},"uuid":"test-user-1","timestamp":"2025-07-20T22:56:38.702Z","sessionId":"session1","cwd":"/test/project1","gitBranch":"main"}"#;
        let session1_file = project1_dir.join("session1.jsonl");
        fs::write(&session1_file, session1_content).unwrap();

        // Sleep to ensure different modification times
        std::thread::sleep(std::time::Duration::from_millis(100));

        let session2_content = r#"{"type":"user","message":{"role":"user","content":"Project 2 message"},"uuid":"test-user-2","timestamp":"2025-07-20T22:56:40.702Z","sessionId":"session2","cwd":"/test/project2","gitBranch":"main"}"#;
        let session2_file = project2_dir.join("session2.jsonl");
        fs::write(&session2_file, session2_content).unwrap();

        // Add another session to project1 with later modification time
        std::thread::sleep(std::time::Duration::from_millis(100));
        let session1b_content = r#"{"type":"user","message":{"role":"user","content":"Project 1 later message"},"uuid":"test-user-1b","timestamp":"2025-07-20T22:56:42.702Z","sessionId":"session1b","cwd":"/test/project1","gitBranch":"main"}"#;
        let session1b_file = project1_dir.join("session1b.jsonl");
        fs::write(&session1b_file, session1b_content).unwrap();

        let manager = ClaudeDataManager::new_with_dir(&claude_dir).unwrap();
        let project_summaries = manager.get_project_summary().await.unwrap();

        // Should have 2 projects
        assert_eq!(project_summaries.len(), 2);

        // Projects should be sorted by last_activity (most recent first)
        let first_project = &project_summaries[0];
        let second_project = &project_summaries[1];

        // Project1 should be first because session1b was created last
        assert_eq!(first_project.project_path, "/test/project1");
        assert_eq!(first_project.session_count, 2);
        assert_eq!(second_project.project_path, "/test/project2");
        assert_eq!(second_project.session_count, 1);

        // Verify that last_activity is based on file modification time, not content timestamp
        // Project1's last_activity should be later than Project2's
        assert!(first_project.last_activity > second_project.last_activity);
    }

    #[tokio::test]
    async fn test_multiple_sessions_in_same_project_last_activity() {
        let temp_dir = create_test_claude_dir();
        let claude_dir = temp_dir.path().join(".claude");

        let project_dir = claude_dir.join("projects").join("multi-session-project");
        fs::create_dir_all(&project_dir).unwrap();

        // Create multiple session files with different modification times
        let sessions = vec![
            ("session_old.jsonl", "2025-07-20T10:00:00.000Z"),
            ("session_middle.jsonl", "2025-07-20T12:00:00.000Z"),
            ("session_new.jsonl", "2025-07-20T14:00:00.000Z"),
        ];

        let mut latest_file_time: Option<SystemTime> = None;

        for (i, (filename, timestamp)) in sessions.iter().enumerate() {
            let content = format!(
                r#"{{"type":"user","message":{{"role":"user","content":"Message {}"}},"uuid":"test-user-{}","timestamp":"{}","sessionId":"session-{}","cwd":"/test/multi-project","gitBranch":"main"}}"#,
                i + 1,
                i + 1,
                timestamp,
                i + 1
            );
            let session_file = project_dir.join(filename);
            fs::write(&session_file, content).unwrap();

            // Add a small delay to ensure different modification times
            if i < sessions.len() - 1 {
                std::thread::sleep(std::time::Duration::from_millis(50));
            }

            // Track the latest file modification time
            let file_time = fs::metadata(&session_file).unwrap().modified().unwrap();
            if latest_file_time.is_none() || file_time > latest_file_time.unwrap() {
                latest_file_time = Some(file_time);
            }
        }

        let manager = ClaudeDataManager::new_with_dir(&claude_dir).unwrap();
        let project_summaries = manager.get_project_summary().await.unwrap();

        assert_eq!(project_summaries.len(), 1);
        let project = &project_summaries[0];

        assert_eq!(project.project_path, "/test/multi-project");
        assert_eq!(project.session_count, 3);
        assert_eq!(project.total_messages, 3);

        // Verify that last_activity matches the latest file modification time
        let expected_datetime = DateTime::<Utc>::from(latest_file_time.unwrap());
        let time_diff = (project.last_activity - expected_datetime)
            .num_seconds()
            .abs();
        assert!(
            time_diff <= 2,
            "Project last_activity should match the latest file modification time"
        );
    }
}
