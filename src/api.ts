import type {
  ClaudeSession,
  ClaudeMessage,
  CommandLogEntry,
  TodoItem,
  ClaudeSettings,
  ProjectSummary,
  SessionStats,
  IdeInfo,
  ClaudeDirectoryInfo,
  CustomCommand,
  Agent,
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

  async getChangedSessions(): Promise<ClaudeSession[]> {
    if (isTauri && tauriApi) {
      return tauriApi.invoke("get_changed_sessions");
    }
    // For mock API, return empty array since we don't track changes
    return [];
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

  // IDE window activation
  async activateIdeWindow(ideInfo: IdeInfo): Promise<void> {
    if (isTauri && tauriApi) {
      return tauriApi.invoke("activate_ide_window", { ideInfo });
    }
    // Mock API doesn't need window activation
    return Promise.resolve();
  },

  async openSessionFile(sessionId: string): Promise<void> {
    if (isTauri && tauriApi) {
      return tauriApi.invoke("open_session_file", { sessionId });
    }
    // Mock API doesn't support file operations
    console.log(`Would open JSONL file for session: ${sessionId}`);
    return Promise.resolve();
  },

  // Path mapping
  async getProjectPathMapping(): Promise<Record<string, string>> {
    if (isTauri && tauriApi) {
      return tauriApi.invoke("get_project_path_mapping");
    }
    // Mock API returns empty mapping
    return {};
  },

  // Home directory
  async getHomeDirectory(): Promise<string> {
    if (isTauri && tauriApi) {
      return tauriApi.invoke("get_home_directory");
    }
    // Mock API returns a default home directory
    return "/Users/user";
  },

  // Real-time monitoring
  async startFileWatcher(): Promise<void> {
    if (isTauri && tauriApi) {
      return tauriApi.invoke("start_file_watcher");
    }
    // Mock API doesn't need file watching
    return Promise.resolve();
  },

  // .claude directory management
  async getClaudeDirectoryInfo(
    projectPath: string,
  ): Promise<ClaudeDirectoryInfo> {
    if (isTauri && tauriApi) {
      return tauriApi.invoke("get_claude_directory_info", { projectPath });
    }
    return mockApi.getClaudeDirectoryInfo(projectPath);
  },

  async readClaudeFile(filePath: string): Promise<string> {
    if (isTauri && tauriApi) {
      return tauriApi.invoke("read_claude_file", { filePath });
    }
    return mockApi.readClaudeFile(filePath);
  },

  async writeClaudeFile(filePath: string, content: string): Promise<void> {
    if (isTauri && tauriApi) {
      return tauriApi.invoke("write_claude_file", { filePath, content });
    }
    return mockApi.writeClaudeFile(filePath, content);
  },

  // Custom commands and agents
  async getCustomCommands(): Promise<CustomCommand[]> {
    if (isTauri && tauriApi) {
      return tauriApi.invoke("get_custom_commands");
    }
    return mockApi.getCustomCommands();
  },

  async getAgents(): Promise<Agent[]> {
    if (isTauri && tauriApi) {
      return tauriApi.invoke("get_agents");
    }
    return mockApi.getAgents();
  },

  async saveCustomCommand(name: string, content: string): Promise<void> {
    if (isTauri && tauriApi) {
      return tauriApi.invoke("save_custom_command", { name, content });
    }
    return mockApi.saveCustomCommand(name, content);
  },

  async saveAgent(name: string, content: string): Promise<void> {
    if (isTauri && tauriApi) {
      return tauriApi.invoke("save_agent", { name, content });
    }
    return mockApi.saveAgent(name, content);
  },

  async deleteCustomCommand(name: string): Promise<void> {
    if (isTauri && tauriApi) {
      return tauriApi.invoke("delete_custom_command", { name });
    }
    return mockApi.deleteCustomCommand(name);
  },

  async deleteAgent(name: string): Promise<void> {
    if (isTauri && tauriApi) {
      return tauriApi.invoke("delete_agent", { name });
    }
    return mockApi.deleteAgent(name);
  },

  // Settings files
  async getAllSettingsFiles(): Promise<[string, string][]> {
    if (isTauri && tauriApi) {
      return tauriApi.invoke("get_all_settings_files");
    }
    return mockApi.getAllSettingsFiles();
  },

  async saveSettingsFile(filename: string, content: string): Promise<void> {
    if (isTauri && tauriApi) {
      return tauriApi.invoke("save_settings_file", { filename, content });
    }
    return mockApi.saveSettingsFile(filename, content);
  },
};
