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
// Tauri 2.0 では __TAURI__ の代わりに直接 API のインポートを試行
let isTauri = false;
let tauriApi: any = null;
let mockApi: any = null;

try {
  // Try to import Tauri API first
  tauriApi = await import("@tauri-apps/api/core");
  // Test if invoke function is available
  await tauriApi.invoke("get_session_stats");
  isTauri = true;
} catch (error) {
  // If Tauri API fails, we're in browser environment
  isTauri = false;

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

  // Real-time monitoring
  async startFileWatcher(): Promise<void> {
    if (isTauri && tauriApi) {
      return tauriApi.invoke("start_file_watcher");
    }
    // Mock API doesn't need file watching
    return Promise.resolve();
  },
};
