import { invoke } from "@tauri-apps/api/core";
import type {
  ClaudeSession,
  ClaudeMessage,
  CommandLogEntry,
  TodoItem,
  ClaudeSettings,
  ProjectSummary,
  SessionStats,
} from "./types";

export const api = {
  // Session management
  async getAllSessions(): Promise<ClaudeSession[]> {
    return invoke("get_all_sessions");
  },

  async getSessionMessages(sessionId: string): Promise<ClaudeMessage[]> {
    return invoke("get_session_messages", { sessionId });
  },

  async searchSessions(query: string): Promise<ClaudeSession[]> {
    return invoke("search_sessions", { query });
  },

  // Command history
  async getCommandHistory(): Promise<CommandLogEntry[]> {
    return invoke("get_command_history");
  },

  async searchCommands(query: string): Promise<CommandLogEntry[]> {
    return invoke("search_commands", { query });
  },

  // Todo management
  async getTodos(): Promise<TodoItem[]> {
    return invoke("get_todos");
  },

  // Settings
  async getSettings(): Promise<ClaudeSettings> {
    return invoke("get_settings");
  },

  // Statistics and summaries
  async getProjectSummary(): Promise<ProjectSummary[]> {
    return invoke("get_project_summary");
  },

  async getSessionStats(): Promise<SessionStats> {
    return invoke("get_session_stats");
  },

  // Export functionality
  async exportSessionData(sessionId: string): Promise<string> {
    return invoke("export_session_data", { sessionId });
  },
};