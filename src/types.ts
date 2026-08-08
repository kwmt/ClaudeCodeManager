export interface IdeInfo {
  pid: number;
  workspace_folders: string[];
  ide_name: string;
  transport: string;
  running_in_windows: boolean;
  auth_token: string;
}

export interface ClaudeSession {
  session_id: string;
  project_path: string;
  timestamp: string;
  message_count: number;
  git_branch?: string;
  latest_content_preview?: string;
  ide_info?: IdeInfo;
  is_processing: boolean;
  file_modified_time: string;
}

export type ProcessingStatus = "processing" | "completed" | "stopped" | "error";

export type ClaudeMessage =
  | {
      uuid: string;
      parent_uuid?: string;
      session_id: string;
      timestamp: string;
      message_type: "user";
      content: MessageContent;
      cwd: string;
      git_branch?: string;
      processing_status: ProcessingStatus;
    }
  | {
      uuid: string;
      parent_uuid?: string;
      session_id: string;
      timestamp: string;
      message_type: "assistant";
      content: MessageContent;
      cwd: string;
      git_branch?: string;
      processing_status: ProcessingStatus;
      stop_reason?: string;
    }
  | {
      message_type: "summary";
      summary: string;
      leafUuid: string;
    };

export type MessageContent =
  | { role: string; content: string }
  | { role: string; content: ContentBlock[] };

export type ContentBlock =
  | { type: "text"; text: string }
  | { type: "tool_use"; id: string; name: string; input: any };

export interface TodoItem {
  id: string;
  content: string;
  status: "Pending" | "InProgress" | "Completed";
  priority: "Low" | "Medium" | "High";
}

export interface CommandLogEntry {
  timestamp: string;
  user: string;
  command: string;
  cwd?: string;
}

export interface ClaudeSettings {
  permissions: PermissionSettings;
  hooks: HookSettings;
}

export interface PermissionSettings {
  defaultMode: string;
  allow: string[];
  deny: string[];
}

export interface HookSettings {
  PreToolUse: HookMatcher[];
}

export interface HookMatcher {
  matcher: string;
  hooks: Hook[];
}

export interface Hook {
  type: string;
  command: string;
}

export interface ProjectSummary {
  project_path: string;
  session_count: number;
  last_activity: string;
  total_messages: number;
  active_todos: number;
  ide_info?: IdeInfo;
}

export interface SessionStats {
  total_sessions: number;
  total_messages: number;
  total_commands: number;
  active_projects: number;
  pending_todos: number;
}

export interface ClaudeDirectoryInfo {
  path: string;
  exists: boolean;
  files: ClaudeDirectoryFile[];
}

export interface ClaudeDirectoryFile {
  name: string;
  path: string;
  size: number;
  modified: string;
  is_directory: boolean;
}

export interface CustomCommand {
  name: string;
  content: string;
}

export interface Agent {
  name: string;
  content: string;
}

// ============================================================================
// In-App Prompt Runner (Issue #181)
// Rust 側 DTO と同じ snake_case。例外は PermissionMode の値のみ（CLI 引数と同一文字列）
// ============================================================================

export type PermissionMode = "plan" | "acceptEdits" | "bypassPermissions";

export interface ClaudeCliStatus {
  available: boolean;
  path?: string | null;
  version?: string | null;
  error?: string | null;
}

export type PromptRunEventKind = "message" | "stderr" | "exit" | "error";

export interface PromptRunEvent {
  run_id: string;
  kind: PromptRunEventKind;
  payload?: StreamJsonMessage | null;
  text?: string | null;
  exit_code?: number | null;
  success?: boolean | null;
}

export type StreamContentBlock =
  | { type: "text"; text: string }
  | { type: "thinking"; thinking?: string }
  | {
      type: "tool_use";
      id: string;
      name: string;
      input: Record<string, unknown>;
    }
  | {
      type: "tool_result";
      tool_use_id: string;
      content?: unknown;
      is_error?: boolean;
    };

export interface StreamJsonMessage {
  type: string; // "system" | "assistant" | "user" | "result" | ...
  subtype?: string;
  session_id?: string;
  model?: string;
  message?: { role: string; content: string | StreamContentBlock[] };
  result?: string;
  is_error?: boolean;
  duration_ms?: number;
  num_turns?: number;
  total_cost_usd?: number;
  [key: string]: unknown;
}

export interface StartPromptRunParams {
  projectPath: string;
  prompt: string;
  permissionMode: PermissionMode;
  resumeSessionId?: string | null;
  model?: string | null;
}
