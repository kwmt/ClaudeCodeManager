// Mock API for development and screenshot purposes
import type {
  ClaudeSession,
  ClaudeMessage,
  CommandLogEntry,
  TodoItem,
  ClaudeSettings,
  ProjectSummary,
  SessionStats,
} from "./types";

// Mock data for demonstration
const mockSessions: ClaudeSession[] = [
  {
    session_id: "session-1",
    project_path: "/Users/developer/projects/web-app",
    created_at: "2025-07-20T10:00:00Z",
    updated_at: "2025-07-20T11:30:00Z",
    message_count: 15,
    git_branch: "main"
  },
  {
    session_id: "session-2", 
    project_path: "/Users/developer/projects/mobile-app",
    created_at: "2025-07-19T14:00:00Z",
    updated_at: "2025-07-19T16:45:00Z",
    message_count: 8,
    git_branch: "feature/ui-updates"
  },
  {
    session_id: "session-3",
    project_path: "/Users/developer/projects/api-server",
    created_at: "2025-07-18T09:30:00Z", 
    updated_at: "2025-07-18T12:15:00Z",
    message_count: 12,
    git_branch: "develop"
  }
];

const mockMessages: ClaudeMessage[] = [
  {
    uuid: "msg-1",
    session_id: "session-1",
    timestamp: "2025-07-20T10:00:00Z",
    message_type: "user",
    content: { role: "user", content: "Help me implement a React component for user authentication" },
    cwd: "/Users/developer/projects/web-app",
    git_branch: "main"
  },
  {
    uuid: "msg-2",
    session_id: "session-1", 
    timestamp: "2025-07-20T10:01:00Z",
    message_type: "assistant",
    content: { role: "assistant", content: [{ type: "text", text: "I'll help you create a React authentication component. Let's start by setting up the basic structure..." }] },
    cwd: "/Users/developer/projects/web-app",
    git_branch: "main"
  }
];

const mockCommands: CommandLogEntry[] = [
  {
    timestamp: "2025-07-20T10:30:00Z",
    user: "developer",
    command: "npm install react-router-dom",
    cwd: "/Users/developer/projects/web-app"
  },
  {
    timestamp: "2025-07-20T10:25:00Z", 
    user: "developer",
    command: "git checkout -b feature/auth-component",
    cwd: "/Users/developer/projects/web-app"
  },
  {
    timestamp: "2025-07-20T10:20:00Z",
    user: "developer", 
    command: "npm run test",
    cwd: "/Users/developer/projects/web-app"
  }
];

const mockTodos: TodoItem[] = [
  {
    id: "todo-1",
    content: "Implement user authentication component",
    status: "InProgress", 
    priority: "High"
  },
  {
    id: "todo-2",
    content: "Add error handling for API calls",
    status: "Pending",
    priority: "Medium"
  },
  {
    id: "todo-3",
    content: "Write unit tests for auth module", 
    status: "Completed",
    priority: "High"
  },
  {
    id: "todo-4",
    content: "Update documentation",
    status: "Pending", 
    priority: "Low"
  }
];

const mockStats: SessionStats = {
  total_sessions: 15,
  total_messages: 127,
  total_commands: 89,
  active_projects: 5,
  pending_todos: 8
};

const mockProjects: ProjectSummary[] = [
  {
    project_path: "/Users/developer/projects/web-app",
    session_count: 8,
    last_activity: "2025-07-20T11:30:00Z",
    total_messages: 65,
    active_todos: 3
  },
  {
    project_path: "/Users/developer/projects/mobile-app", 
    session_count: 4,
    last_activity: "2025-07-19T16:45:00Z",
    total_messages: 32,
    active_todos: 2
  },
  {
    project_path: "/Users/developer/projects/api-server",
    session_count: 3,
    last_activity: "2025-07-18T12:15:00Z", 
    total_messages: 30,
    active_todos: 3
  }
];

const mockSettings: ClaudeSettings = {
  permissions: {
    defaultMode: "bypassPermissions",
    allow: ["Bash(git *)", "Bash(npm *)", "Bash(ls *)"],
    deny: ["Bash(rm -rf /*)", "Bash(sudo *)", "Bash(chmod 777 *)"]
  },
  hooks: {
    PreToolUse: [
      {
        matcher: "Bash",
        hooks: [
          {
            type: "command",
            command: "echo 'Executing bash command'"
          }
        ]
      }
    ]
  }
};

// Mock API implementation
export const mockApi = {
  async getAllSessions(): Promise<ClaudeSession[]> {
    await new Promise(resolve => setTimeout(resolve, 500)); // Simulate loading
    return mockSessions;
  },

  async getSessionMessages(sessionId: string): Promise<ClaudeMessage[]> {
    await new Promise(resolve => setTimeout(resolve, 300));
    return mockMessages.filter(msg => {
      if (msg.message_type === 'summary') {
        return false; // Summary messages don't belong to specific sessions
      }
      return msg.session_id === sessionId;
    });
  },

  async searchSessions(query: string): Promise<ClaudeSession[]> {
    await new Promise(resolve => setTimeout(resolve, 300));
    return mockSessions.filter(session =>
      session.project_path.toLowerCase().includes(query.toLowerCase()) ||
      session.session_id.toLowerCase().includes(query.toLowerCase()) ||
      (session.git_branch && session.git_branch.toLowerCase().includes(query.toLowerCase()))
    );
  },

  async getCommandHistory(): Promise<CommandLogEntry[]> {
    await new Promise(resolve => setTimeout(resolve, 400));
    return mockCommands;
  },

  async searchCommands(query: string): Promise<CommandLogEntry[]> {
    await new Promise(resolve => setTimeout(resolve, 300));
    return mockCommands.filter(cmd =>
      cmd.command.toLowerCase().includes(query.toLowerCase())
    );
  },

  async getTodos(): Promise<TodoItem[]> {
    await new Promise(resolve => setTimeout(resolve, 300));
    return mockTodos;
  },

  async getSettings(): Promise<ClaudeSettings> {
    await new Promise(resolve => setTimeout(resolve, 200));
    return mockSettings;
  },

  async getProjectSummary(): Promise<ProjectSummary[]> {
    await new Promise(resolve => setTimeout(resolve, 400));
    return mockProjects;
  },

  async getSessionStats(): Promise<SessionStats> {
    await new Promise(resolve => setTimeout(resolve, 300));
    return mockStats;
  },

  async exportSessionData(sessionId: string): Promise<string> {
    await new Promise(resolve => setTimeout(resolve, 200));
    const messages = mockMessages.filter(msg => {
      if (msg.message_type === 'summary') {
        return false; // Summary messages don't belong to specific sessions
      }
      return msg.session_id === sessionId;
    });
    return JSON.stringify(messages, null, 2);
  },
};