import React, { useEffect, useState } from "react";
import { api } from "../api";
import type { ClaudeSession, ClaudeMessage, ContentBlock } from "../types";

interface SessionBrowserProps {}

export const SessionBrowser: React.FC<SessionBrowserProps> = () => {
  const [sessions, setSessions] = useState<ClaudeSession[]>([]);
  const [allSessions, setAllSessions] = useState<ClaudeSession[]>([]);
  const [selectedSession, setSelectedSession] = useState<ClaudeSession | null>(
    null,
  );
  const [messages, setMessages] = useState<ClaudeMessage[]>([]);
  const [searchQuery, setSearchQuery] = useState("");
  const [selectedProject, setSelectedProject] = useState<string>("all");
  const [projects, setProjects] = useState<string[]>([]);
  const [loading, setLoading] = useState(true);
  const [loadingMessages, setLoadingMessages] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    loadSessions();

    // File change events disabled - real-time updates removed
  }, []);

  useEffect(() => {
    if (allSessions.length > 0) {
      filterSessions(allSessions, searchQuery, selectedProject);
    }
  }, [searchQuery, selectedProject, allSessions]);

  const loadSessions = async () => {
    try {
      setLoading(true);
      setError(null);
      const data = await api.getAllSessions();
      setAllSessions(data);

      // Extract unique projects
      const uniqueProjects = Array.from(
        new Set(data.map((session) => session.project_path)),
      ).sort();
      setProjects(uniqueProjects);

      // Apply current filters
      filterSessions(data, searchQuery, selectedProject);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to load sessions");
    } finally {
      setLoading(false);
    }
  };

  const filterSessions = (
    sessionsToFilter: ClaudeSession[],
    query: string,
    project: string,
  ) => {
    let filtered = sessionsToFilter;

    // Apply project filter
    if (project !== "all") {
      filtered = filtered.filter((session) => session.project_path === project);
    }

    // Apply search query filter
    if (query.trim()) {
      const queryLower = query.toLowerCase();
      filtered = filtered.filter(
        (session) =>
          session.project_path.toLowerCase().includes(queryLower) ||
          session.session_id.toLowerCase().includes(queryLower) ||
          session.git_branch?.toLowerCase().includes(queryLower),
      );
    }

    setSessions(filtered);
  };

  const loadSessionMessages = async (session: ClaudeSession) => {
    try {
      setLoadingMessages(true);
      setSelectedSession(session);
      const data = await api.getSessionMessages(session.session_id);
      setMessages(data);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to load messages");
    } finally {
      setLoadingMessages(false);
    }
  };

  const refreshAllSessions = async () => {
    await loadSessions();
  };

  const exportSession = async (sessionId: string) => {
    try {
      const data = await api.exportSessionData(sessionId);
      const blob = new Blob([data], { type: "application/json" });
      const url = URL.createObjectURL(blob);
      const a = document.createElement("a");
      a.href = url;
      a.download = `session_${sessionId}.json`;
      document.body.appendChild(a);
      a.click();
      document.body.removeChild(a);
      URL.revokeObjectURL(url);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to export session");
    }
  };

  const renderContentBlock = (block: ContentBlock, index: number) => {
    if (block.type === "text") {
      return (
        <div key={index} className="text-block">
          <pre className="content-text">{block.text}</pre>
        </div>
      );
    }

    if (block.type === "tool_use") {
      return (
        <div key={index} className="tool-use-block">
          <div className="tool-header">
            <span className="tool-icon">🛠️</span>
            <span className="tool-name">{block.name}</span>
          </div>
          <div className="tool-input">
            <pre>{JSON.stringify(block.input, null, 2)}</pre>
          </div>
        </div>
      );
    }

    return null;
  };

  const renderMessageContent = (message: ClaudeMessage) => {
    if (message.message_type === "user") {
      const userContent = message.content.content;

      if (typeof userContent === "string") {
        // コマンドメッセージの場合の特別な処理
        if (
          userContent.includes("<command-name>") &&
          userContent.includes("</command-name>")
        ) {
          const commandMatch = userContent.match(
            /<command-name>([^<]+)<\/command-name>/,
          );
          const messageMatch = userContent.match(
            /<command-message>([^<]*)<\/command-message>/,
          );
          const argsMatch = userContent.match(
            /<command-args>([^<]*)<\/command-args>/,
          );

          return (
            <div className="message-content user-content command-content">
              <div className="command-info">
                <span className="command-label">Command:</span>{" "}
                {commandMatch?.[1] || "Unknown"}
              </div>
              {messageMatch?.[1] && (
                <div className="command-message">{messageMatch[1]}</div>
              )}
              {argsMatch?.[1] && (
                <div className="command-args">
                  <span className="args-label">Args:</span> {argsMatch[1]}
                </div>
              )}
            </div>
          );
        }

        // 通常のテキストメッセージ（contentがstringの場合はそのまま表示）
        return (
          <div className="message-content user-content">
            <pre className="content-text">{userContent}</pre>
          </div>
        );
      } else if (Array.isArray(userContent)) {
        // ContentBlock[]の場合
        return (
          <div className="message-content user-content">
            {userContent.map((block: any, index: number) =>
              renderContentBlock(block, index),
            )}
          </div>
        );
      }
    }

    if (message.message_type === "assistant") {
      const assistantContent = message.content.content;

      if (Array.isArray(assistantContent)) {
        return (
          <div className="message-content assistant-content">
            {assistantContent.map((block: any, index: number) =>
              renderContentBlock(block, index),
            )}
          </div>
        );
      }
    }

    if (message.message_type === "summary") {
      // Summaryメッセージの特別な処理 - summaryフィールドを使用
      return (
        <div className="message-content summary-message-content">
          <div className="summary-message-header">
            <span className="summary-message-icon">📋</span>
            <span className="summary-message-label">Summary</span>
          </div>
          <div className="summary-message-text">{message.summary}</div>
        </div>
      );
    }

    return (
      <div className="message-content">
        <pre className="content-text">{JSON.stringify(message, null, 2)}</pre>
      </div>
    );
  };

  if (error) {
    return (
      <div className="session-browser-error">
        <h3>Error</h3>
        <p>{error}</p>
        <button onClick={loadSessions}>Retry</button>
      </div>
    );
  }

  return (
    <div className="session-browser">
      <div className="session-browser-header">
        <h2>Session Browser</h2>
        <div className="header-controls">
          <div className="project-filter">
            <label htmlFor="project-select">Project:</label>
            <select
              id="project-select"
              value={selectedProject}
              onChange={(e) => setSelectedProject(e.target.value)}
              className="project-select"
            >
              <option value="all">All Projects</option>
              {projects.map((project) => (
                <option key={project} value={project}>
                  {project.split("/").pop() || project}
                </option>
              ))}
            </select>
          </div>
          <div className="search-container">
            <label htmlFor="search-input">Search:</label>
            <input
              id="search-input"
              type="text"
              placeholder="Search sessions by project path, branch, or ID..."
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              className="search-input"
            />
          </div>
          <button
            className="refresh-all-button"
            onClick={refreshAllSessions}
            disabled={loading}
            title="Refresh all sessions"
          >
            {loading ? "🔄" : "🔄"} Refresh
          </button>
        </div>
      </div>

      <div className="session-browser-content">
        <div className="sessions-list">
          {!loading && (
            <div className="sessions-count">
              {sessions.length} session{sessions.length !== 1 ? "s" : ""}
              {selectedProject !== "all" &&
                ` in ${selectedProject.split("/").pop()}`}
              {searchQuery && ` matching "${searchQuery}"`}
            </div>
          )}
          {loading ? (
            <div className="loading">Loading sessions...</div>
          ) : sessions.length === 0 ? (
            <div className="no-sessions">No sessions found</div>
          ) : (
            sessions.map((session) => (
              <div
                key={session.session_id}
                className={`session-item ${selectedSession?.session_id === session.session_id ? "selected" : ""}`}
                onClick={() => loadSessionMessages(session)}
              >
                <div className="session-header">
                  <h4>
                    {session.project_path.split("/").pop() ||
                      session.project_path}
                  </h4>
                  <div className="session-actions">
                    <button
                      className="export-button"
                      onClick={(e) => {
                        e.stopPropagation();
                        exportSession(session.session_id);
                      }}
                    >
                      Export
                    </button>
                  </div>
                </div>
                <p className="session-path">{session.project_path}</p>
                <div className="session-meta">
                  <span>{session.message_count} messages</span>
                  {session.git_branch && (
                    <span>Branch: {session.git_branch}</span>
                  )}
                  <span>
                    Updated: {new Date(session.updated_at).toLocaleDateString()}
                  </span>
                </div>
              </div>
            ))
          )}
        </div>

        <div className="messages-panel">
          {selectedSession ? (
            <>
              <div className="messages-header">
                <h3>
                  Messages for {selectedSession.project_path.split("/").pop()}
                </h3>
                <p>Session ID: {selectedSession.session_id}</p>
              </div>

              {loadingMessages ? (
                <div className="loading">Loading messages...</div>
              ) : messages.length === 0 ? (
                <div className="no-messages">No messages found</div>
              ) : (
                <div className="messages-list">
                  {messages.map((message, index) => (
                    <div
                      key={
                        message.message_type === "summary"
                          ? `summary-${index}`
                          : message.uuid
                      }
                      className={`message ${message.message_type.toLowerCase()}`}
                    >
                      <div className="message-header">
                        <span className="message-type">
                          {message.message_type}
                        </span>
                        <span className="message-time">
                          {message.message_type === "summary"
                            ? ""
                            : new Date(message.timestamp).toLocaleString()}
                        </span>
                      </div>
                      {renderMessageContent(message)}
                      {message.message_type !== "summary" && message.cwd && (
                        <div className="message-meta">CWD: {message.cwd}</div>
                      )}
                    </div>
                  ))}
                </div>
              )}
            </>
          ) : (
            <div className="no-session-selected">
              Select a session to view its messages
            </div>
          )}
        </div>
      </div>
    </div>
  );
};
