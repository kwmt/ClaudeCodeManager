import React, { useEffect, useState, useRef } from "react";
import { marked } from "marked";
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

  // New state for message filtering and search
  const [messageSearchQuery, setMessageSearchQuery] = useState("");
  const [selectedMessageType, setSelectedMessageType] = useState<string>("all");
  const [filteredMessages, setFilteredMessages] = useState<ClaudeMessage[]>([]);
  const [renderAsMarkdown, setRenderAsMarkdown] = useState(false);
  const messageListRef = useRef<HTMLDivElement>(null);

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
      setFilteredMessages(data);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to load messages");
    } finally {
      setLoadingMessages(false);
    }
  };

  const refreshAllSessions = async () => {
    await loadSessions();
    // Refresh messages if a session is selected
    if (selectedSession) {
      await loadSessionMessages(selectedSession);
    }
  };

  // Filter messages based on search and type
  useEffect(() => {
    if (!messages.length) {
      setFilteredMessages([]);
      return;
    }

    let filtered = messages;

    // Filter by message type
    if (selectedMessageType !== "all") {
      filtered = filtered.filter(
        (message) => message.message_type === selectedMessageType,
      );
    }

    // Filter by search query
    if (messageSearchQuery.trim()) {
      const query = messageSearchQuery.toLowerCase();
      filtered = filtered.filter((message) => {
        // Search in content
        const content = getMessageTextContent(message);
        if (content.toLowerCase().includes(query)) return true;

        // Search in UUID
        if (
          message.message_type !== "summary" &&
          message.uuid.toLowerCase().includes(query)
        )
          return true;

        // Search in timestamp
        if (
          message.message_type !== "summary" &&
          new Date(message.timestamp)
            .toLocaleString()
            .toLowerCase()
            .includes(query)
        )
          return true;

        return false;
      });
    }

    setFilteredMessages(filtered);
  }, [messages, messageSearchQuery, selectedMessageType]);

  // Helper function to extract text content from message
  const getMessageTextContent = (message: ClaudeMessage): string => {
    if (message.message_type === "summary") {
      return message.summary;
    }

    const content = message.content.content;

    if (typeof content === "string") {
      return content;
    }

    if (Array.isArray(content)) {
      return content
        .map((block) => {
          if (block.type === "text") {
            return block.text;
          }
          if (block.type === "tool_use") {
            return `${block.name}: ${JSON.stringify(block.input)}`;
          }
          return "";
        })
        .join(" ");
    }

    return "";
  };

  // Scroll to specific message
  const scrollToMessage = (messageId: string) => {
    const messageElement = document.getElementById(`message-${messageId}`);
    if (messageElement && messageListRef.current) {
      messageElement.scrollIntoView({ behavior: "smooth", block: "center" });
      // Highlight message briefly
      messageElement.classList.add("highlighted");
      setTimeout(() => messageElement.classList.remove("highlighted"), 2000);
    }
  };

  // Render text with optional markdown
  const renderText = (
    text: string,
    isMarkdown: boolean = false,
  ): JSX.Element => {
    if (isMarkdown && renderAsMarkdown) {
      return (
        <div
          className="markdown-content"
          dangerouslySetInnerHTML={{ __html: marked(text) }}
        />
      );
    }
    return <pre className="content-text word-wrap">{text}</pre>;
  };

  const activateIdeWindow = async (session: ClaudeSession) => {
    if (!session.ide_info) {
      setError("No IDE information available for this session");
      return;
    }

    try {
      await api.activateIdeWindow(session.ide_info);
    } catch (err) {
      setError(
        err instanceof Error ? err.message : "Failed to activate IDE window",
      );
    }
  };

  const renderContentBlock = (block: ContentBlock, index: number) => {
    if (block.type === "text") {
      // Check if this is an Edit tool with old_string/new_string for diff view
      const text = block.text;

      // Try to parse as JSON to detect Edit tool usage
      try {
        const parsed = JSON.parse(text);
        if (parsed.old_string && parsed.new_string) {
          return (
            <div key={index} className="text-block diff-view">
              <div className="diff-header">Code Changes</div>
              <div className="diff-content">
                <div className="diff-old">
                  <div className="diff-label">- Removed</div>
                  <pre className="content-text diff-removed">
                    {parsed.old_string}
                  </pre>
                </div>
                <div className="diff-new">
                  <div className="diff-label">+ Added</div>
                  <pre className="content-text diff-added">
                    {parsed.new_string}
                  </pre>
                </div>
              </div>
            </div>
          );
        }
      } catch {
        // Not valid JSON, continue with normal text rendering
      }

      // Check if text looks like markdown (contains headers, lists, code blocks)
      const looksLikeMarkdown = /^#{1,6}\s|^\*\s|^-\s|^```|^\d+\.\s/.test(text);

      return (
        <div key={index} className="text-block">
          {renderText(text, looksLikeMarkdown)}
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
            <pre className="word-wrap">
              {JSON.stringify(block.input, null, 2)}
            </pre>
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
        const looksLikeMarkdown = /^#{1,6}\s|^\*\s|^-\s|^```|^\d+\.\s/m.test(
          userContent,
        );
        return (
          <div className="message-content user-content">
            {renderText(userContent, looksLikeMarkdown)}
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
            title="Refresh all sessions and messages"
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
                    <span
                      className={`session-status-indicator ${session.is_processing ? "status-processing" : "status-completed"}`}
                      title={
                        session.is_processing
                          ? "Session has sequences still processing"
                          : "Session completed"
                      }
                    >
                      <span className="status-dot"></span>
                    </span>
                  </h4>
                  <div className="session-actions">
                    {session.ide_info && (
                      <button
                        className="export-button"
                        onClick={(e) => {
                          e.stopPropagation();
                          activateIdeWindow(session);
                        }}
                        title={`${session.ide_info.ide_name} (PID: ${session.ide_info.pid})`}
                      >
                        IDE
                      </button>
                    )}
                  </div>
                </div>
                <p className="session-path">{session.project_path}</p>
                {session.latest_content_preview && (
                  <div className="session-preview">
                    <p className="preview-text">
                      {session.latest_content_preview}
                    </p>
                  </div>
                )}
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
                <div className="messages-title">
                  <h3>
                    Messages for {selectedSession.project_path.split("/").pop()}
                  </h3>
                  <p>Session ID: {selectedSession.session_id}</p>
                </div>

                <div className="message-controls">
                  <div className="message-search">
                    <input
                      type="text"
                      placeholder="Search messages..."
                      value={messageSearchQuery}
                      onChange={(e) => setMessageSearchQuery(e.target.value)}
                      className="message-search-input"
                    />
                  </div>

                  <div className="message-type-filter">
                    <select
                      value={selectedMessageType}
                      onChange={(e) => setSelectedMessageType(e.target.value)}
                      className="message-type-select"
                    >
                      <option value="all">All Types</option>
                      <option value="user">User</option>
                      <option value="assistant">Assistant</option>
                      <option value="summary">Summary</option>
                    </select>
                  </div>

                  <div className="markdown-toggle">
                    <label>
                      <input
                        type="checkbox"
                        checked={renderAsMarkdown}
                        onChange={(e) => setRenderAsMarkdown(e.target.checked)}
                      />
                      Markdown
                    </label>
                  </div>
                </div>
              </div>

              {loadingMessages ? (
                <div className="loading">Loading messages...</div>
              ) : filteredMessages.length === 0 ? (
                <div className="no-messages">
                  {messageSearchQuery || selectedMessageType !== "all"
                    ? "No messages match the current filters"
                    : "No messages found"}
                </div>
              ) : (
                <div className="messages-list" ref={messageListRef}>
                  {filteredMessages.map((message, index) => {
                    const messageId =
                      message.message_type === "summary"
                        ? `summary-${index}`
                        : message.uuid;
                    return (
                      <div
                        key={messageId}
                        id={`message-${messageId}`}
                        className={`message ${message.message_type.toLowerCase()}`}
                        onClick={() => scrollToMessage(messageId)}
                      >
                        <div className="message-header">
                          <span className="message-type">
                            {message.message_type}
                            {message.message_type !== "summary" && (
                              <span
                                className={`status-indicator status-${message.processing_status}`}
                                title={`Status: ${message.processing_status}${message.message_type === "assistant" && message.stop_reason ? ` (${message.stop_reason})` : ""}`}
                              >
                                <span className="status-dot"></span>
                              </span>
                            )}
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
                    );
                  })}
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
