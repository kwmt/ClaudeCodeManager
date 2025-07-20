import type {
  ClaudeSession,
  ClaudeMessage,
  CommandLogEntry,
  TodoItem,
  ClaudeSettings,
  ProjectSummary,
  SessionStats,
} from "./types";

// Check if we're running in Tauri environment
const isTauri = typeof window !== 'undefined' && '__TAURI__' in window;

let tauriApi: any = null;
let mockApi: any = null;

if (isTauri) {
  // Dynamically import Tauri API only when needed
  tauriApi = await import("@tauri-apps/api/core");
} else {
  // Use mock API for development/screenshots
  const mockModule = await import("./api-mock");
  mockApi = mockModule.mockApi;
}

export const api = {
  // Session management
  async getAllSessions(): Promise<ClaudeSession[]> {
    if (isTauri && tauriApi) {
      return tauriApi.invoke("get_all_sessions");
    }
    return mockApi.getAllSessions();
  },

  async getSessionMessages(sessionId: string): Promise<ClaudeMessage[]> {
    if (isTauri && tauriApi) {
      return tauriApi.invoke("get_session_messages", { sessionId });
    }
    return mockApi.getSessionMessages(sessionId);
  },

  async searchSessions(query: string): Promise<ClaudeSession[]> {
    if (isTauri && tauriApi) {
      return tauriApi.invoke("search_sessions", { query });
    }
    return mockApi.searchSessions(query);
  },

  // Command history
  async getCommandHistory(): Promise<CommandLogEntry[]> {
    if (isTauri && tauriApi) {
      return tauriApi.invoke("get_command_history");
    }
    return mockApi.getCommandHistory();
  },

  async searchCommands(query: string): Promise<CommandLogEntry[]> {
    if (isTauri && tauriApi) {
      return tauriApi.invoke("search_commands", { query });
    }
    return mockApi.searchCommands(query);
  },

  // Todo management
  async getTodos(): Promise<TodoItem[]> {
    if (isTauri && tauriApi) {
      return tauriApi.invoke("get_todos");
    }
    return mockApi.getTodos();
  },

  // Settings
  async getSettings(): Promise<ClaudeSettings> {
    if (isTauri && tauriApi) {
      return tauriApi.invoke("get_settings");
    }
    return mockApi.getSettings();
  },

  // Statistics and summaries
  async getProjectSummary(): Promise<ProjectSummary[]> {
    if (isTauri && tauriApi) {
      return tauriApi.invoke("get_project_summary");
    }
    return mockApi.getProjectSummary();
  },

  async getSessionStats(): Promise<SessionStats> {
    if (isTauri && tauriApi) {
      return tauriApi.invoke("get_session_stats");
    }
    return mockApi.getSessionStats();
  },

  // Export functionality
  async exportSessionData(sessionId: string): Promise<string> {
    if (isTauri && tauriApi) {
      return tauriApi.invoke("export_session_data", { sessionId });
    }
    return mockApi.exportSessionData(sessionId);
  },
};