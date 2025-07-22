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
  created_at: string;
  updated_at: string;
  message_count: number;
  git_branch?: string;
  latest_content_preview?: string;
  ide_info?: IdeInfo;
  is_processing: boolean;
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
  latest_message?: string;
}

export interface SessionStats {
  total_sessions: number;
  total_messages: number;
  total_commands: number;
  active_projects: number;
  pending_todos: number;
}
