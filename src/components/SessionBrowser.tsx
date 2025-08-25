import React, { useEffect, useState, useCallback } from "react";
import { api } from "../api";
import { formatDateTime, formatDateTooltip } from "../utils/dateUtils";
import type { ClaudeSession, ClaudeMessage } from "../types";
import { MessagesList } from "./MessagesList";

interface SessionBrowserProps {
  initialProjectFilter?: string;
}

export const SessionBrowser: React.FC<SessionBrowserProps> = ({
  initialProjectFilter = "all",
}) => {
  const [sessions, setSessions] = useState<ClaudeSession[]>([]);
  const [allSessions, setAllSessions] = useState<ClaudeSession[]>([]);
  const [selectedSession, setSelectedSession] = useState<ClaudeSession | null>(
    null,
  );
  const [messages, setMessages] = useState<ClaudeMessage[]>([]);
  const [searchQuery, setSearchQuery] = useState("");
  const [selectedProject, setSelectedProject] =
    useState<string>(initialProjectFilter);
  const [projects, setProjects] = useState<string[]>([]);
  const [loading, setLoading] = useState(true);
  const [loadingMessages, setLoadingMessages] = useState(false);
  const [error, setError] = useState<string | null>(null);

  // New state for message filtering and search
  const [messageSearchQuery, setMessageSearchQuery] = useState("");
  const [selectedMessageType, setSelectedMessageType] = useState<string>("all");
  const [renderAsMarkdown, setRenderAsMarkdown] = useState(false);

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

  // State for initial scroll target
  const [initialScrollTarget, setInitialScrollTarget] = useState<
    string | undefined
  >(undefined);

  const loadSessionMessages = useCallback(
    async (session: ClaudeSession, forceRefresh: boolean = false) => {
      try {
        setLoadingMessages(true);
        setSelectedSession(session);
        setError(null); // Clear any previous errors

        // Clear initial scroll target if switching sessions
        if (selectedSession?.session_id !== session.session_id) {
          setInitialScrollTarget(undefined);
        }

        const data = await api.getSessionMessages(session.session_id);

        // Validate data
        if (!Array.isArray(data)) {
          throw new Error(
            `Invalid data received: expected array, got ${typeof data}`,
          );
        }

        setMessages(data);

        // Set initial scroll target for latest content preview
        if (
          data.length > 0 &&
          session.latest_content_preview &&
          !forceRefresh
        ) {
          // Helper function to extract text content from message
          const getMessageTextContent = (message: ClaudeMessage): string => {
            if (message.message_type === "summary") {
              return (message as any).summary || "";
            }

            if (!("content" in message)) {
              return "";
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

          // Find the message that contains the preview text
          for (let i = 0; i < data.length; i++) {
            const message = data[i];
            const content = getMessageTextContent(message);
            if (
              session.latest_content_preview &&
              content.includes(session.latest_content_preview)
            ) {
              const messageId =
                message.message_type === "summary"
                  ? `summary-${i}`
                  : "uuid" in message
                    ? message.uuid
                    : `message-${i}`;
              setInitialScrollTarget(messageId);
              break;
            }
          }

          // If no message found with preview, scroll to the last message
          if (!initialScrollTarget && data.length > 0) {
            const lastMessage = data[data.length - 1];
            const messageId =
              lastMessage.message_type === "summary"
                ? `summary-${data.length - 1}`
                : "uuid" in lastMessage
                  ? lastMessage.uuid
                  : `message-${data.length - 1}`;
            setInitialScrollTarget(messageId);
          }
        }
      } catch (err) {
        console.error(
          `Error loading messages for session ${session.session_id}:`,
          err,
        );
        setError(
          err instanceof Error ? err.message : "Failed to load messages",
        );
        setMessages([]);
      } finally {
        setLoadingMessages(false);
      }
    },
    [selectedSession?.session_id, initialScrollTarget],
  );

  const refreshAllSessions = async () => {
    const currentSessionId = selectedSession?.session_id;

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

      // Refresh messages if a session is selected
      if (currentSessionId) {
        // Find the updated session data
        const updatedSession = data.find(
          (s) => s.session_id === currentSessionId,
        );
        if (updatedSession) {
          await loadSessionMessages(updatedSession, true); // Force refresh
        }
      }
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to load sessions");
    } finally {
      setLoading(false);
    }
  };

  // Handle message click callback
  const handleMessageClick = useCallback((messageId: string) => {
    console.log(`Clicked message: ${messageId}`);
    // You can add additional functionality here if needed
  }, []);

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
                  <span>
                    <span className="meta-icon">💬</span>
                    {session.message_count}
                  </span>
                  {session.git_branch && (
                    <span>
                      <span className="meta-icon">🌿</span>
                      {session.git_branch}
                    </span>
                  )}
                  <span title={formatDateTooltip(session.file_modified_time)}>
                    <span className="meta-icon">🕐</span>
                    {formatDateTime(session.file_modified_time, {
                      style: "compact",
                      showRelative: true,
                    })}
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
                  <div className="session-id-container">
                    <p>Session ID: {selectedSession.session_id}</p>
                    <button
                      className="open-file-button"
                      onClick={() =>
                        api.openSessionFile(selectedSession.session_id)
                      }
                      title="Open JSONL file in Finder"
                    >
                      📂
                    </button>
                  </div>
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

              <MessagesList
                messages={messages}
                loading={loadingMessages}
                searchQuery={messageSearchQuery}
                messageTypeFilter={selectedMessageType}
                renderAsMarkdown={renderAsMarkdown}
                onMessageClick={handleMessageClick}
                initialScrollToMessage={initialScrollTarget}
              />
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
