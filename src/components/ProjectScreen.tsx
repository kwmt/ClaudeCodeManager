import React, { useEffect, useState, useRef } from "react";
import { marked } from "marked";
import { api } from "../api";
import {
  normalizeProjectPathSync,
  getProjectDisplayName,
  isPathInHomeDirectory,
} from "../utils/pathUtils";
import type {
  ClaudeSession,
  ClaudeMessage,
  ContentBlock,
  ProjectSummary,
} from "../types";

interface ProjectScreenProps {
  projectPath: string;
  onBack: () => void;
}

export const ProjectScreen: React.FC<ProjectScreenProps> = ({
  projectPath,
  onBack,
}) => {
  const [sessions, setSessions] = useState<ClaudeSession[]>([]);
  const [selectedSession, setSelectedSession] = useState<ClaudeSession | null>(
    null,
  );
  const [messages, setMessages] = useState<ClaudeMessage[]>([]);
  const [projectSummary, setProjectSummary] = useState<ProjectSummary | null>(
    null,
  );
  const [loading, setLoading] = useState(true);
  const [loadingMessages, setLoadingMessages] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [activeTab, setActiveTab] = useState<"sessions" | "directory">(
    "sessions",
  );
  const [knownProjectPaths, setKnownProjectPaths] = useState<string[]>([]);

  const [messageSearchQuery, setMessageSearchQuery] = useState("");
  const [selectedMessageType, setSelectedMessageType] = useState<string>("all");
  const [filteredMessages, setFilteredMessages] = useState<ClaudeMessage[]>([]);
  const [renderAsMarkdown, setRenderAsMarkdown] = useState(false);
  const messageListRef = useRef<HTMLDivElement>(null);

  const normalizedPath = normalizeProjectPathSync(
    projectPath,
    knownProjectPaths,
  );
  const displayName = getProjectDisplayName(projectPath);
  const inHomeDirectory = isPathInHomeDirectory(projectPath);

  useEffect(() => {
    loadProjectData();
  }, [projectPath]);

  useEffect(() => {
    if (!messages.length) {
      setFilteredMessages([]);
      return;
    }

    // First, filter out summary messages
    let filtered = messages.filter(
      (message) => message.message_type !== "summary",
    );

    if (selectedMessageType !== "all") {
      filtered = filtered.filter(
        (message) => message.message_type === selectedMessageType,
      );
    }

    if (messageSearchQuery.trim()) {
      const query = messageSearchQuery.toLowerCase();
      filtered = filtered.filter((message) => {
        const content = getMessageTextContent(message);
        if (content.toLowerCase().includes(query)) return true;

        if (message.uuid.toLowerCase().includes(query)) return true;

        if (
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

  const loadProjectData = async () => {
    try {
      setLoading(true);
      setError(null);

      const [allSessions, projectSummaries] = await Promise.all([
        api.getAllSessions(),
        api.getProjectSummary(),
      ]);

      // Extract all known project paths for better normalization
      const allProjectPaths = [
        ...allSessions.map((s) => s.project_path),
        ...projectSummaries.map((p) => p.project_path),
      ];
      const uniqueProjectPaths = [...new Set(allProjectPaths)];
      setKnownProjectPaths(uniqueProjectPaths);

      const projectSessions = allSessions.filter(
        (session) => session.project_path === projectPath,
      );
      setSessions(projectSessions);

      const summary = projectSummaries.find(
        (p) => p.project_path === projectPath,
      );
      setProjectSummary(summary || null);
    } catch (err) {
      setError(
        err instanceof Error ? err.message : "Failed to load project data",
      );
    } finally {
      setLoading(false);
    }
  };

  const loadSessionMessages = async (session: ClaudeSession) => {
    try {
      setLoadingMessages(true);
      setSelectedSession(session);
      const data = await api.getSessionMessages(session.session_id);
      setMessages(data);
      setFilteredMessages(
        data.filter((message) => message.message_type !== "summary"),
      );

      if (data.length > 0 && session.latest_content_preview) {
        setTimeout(() => {
          let targetMessage = null;
          let targetIndex = -1;

          for (let i = 0; i < data.length; i++) {
            const message = data[i];
            const content = getMessageTextContent(message);
            if (
              session.latest_content_preview &&
              content.includes(session.latest_content_preview)
            ) {
              targetMessage = message;
              targetIndex = i;
              break;
            }
          }

          if (!targetMessage && data.length > 0) {
            targetIndex = data.length - 1;
            targetMessage = data[targetIndex];
          }

          if (targetMessage) {
            const messageId =
              targetMessage.message_type === "summary"
                ? `summary-${targetIndex}`
                : targetMessage.uuid;
            const messageElement = document.getElementById(
              `message-${messageId}`,
            );
            if (messageElement && messageListRef.current) {
              messageElement.scrollIntoView({
                behavior: "smooth",
                block: "center",
              });
              messageElement.classList.add("highlighted");
              setTimeout(
                () => messageElement.classList.remove("highlighted"),
                2000,
              );
            }
          }
        }, 150);
      }
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to load messages");
    } finally {
      setLoadingMessages(false);
    }
  };

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

  const renderContentBlock = (block: ContentBlock, index: number) => {
    if (block.type === "text") {
      const text = block.text;
      const looksLikeMarkdown =
        /#{1,6}\s|\*\s|-\s|```|\d+\.\s|\*\*[^*]+\*\*|\*[^*]+\*|`[^`]+`|\[.*\]\(.*\)/m.test(
          text,
        );

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

        const looksLikeMarkdown =
          /#{1,6}\s|\*\s|-\s|```|\d+\.\s|\*\*[^*]+\*\*|\*[^*]+\*|`[^`]+`|\[.*\]\(.*\)/m.test(
            userContent,
          );
        return (
          <div className="message-content user-content">
            {renderText(userContent, looksLikeMarkdown)}
          </div>
        );
      } else if (Array.isArray(userContent)) {
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

  if (loading) {
    return <div className="project-screen-loading">Loading project...</div>;
  }

  if (error) {
    return (
      <div className="project-screen-error">
        <h3>Error loading project</h3>
        <p>{error}</p>
        <button onClick={loadProjectData}>Retry</button>
      </div>
    );
  }

  return (
    <div className="project-screen">
      <div className="project-header">
        <button className="back-button" onClick={onBack}>
          ← Back to Dashboard
        </button>
        <div className="project-info">
          <h2>{displayName}</h2>
          <p className="project-path">{normalizedPath}</p>
          <div className="project-stats">
            {projectSummary && (
              <>
                <span>{projectSummary.session_count} sessions</span>
                <span>{projectSummary.total_messages} messages</span>
                <span>{projectSummary.active_todos} TODOs</span>
                <span>
                  Last activity:{" "}
                  {new Date(projectSummary.last_activity).toLocaleDateString()}
                </span>
              </>
            )}
          </div>
        </div>
      </div>

      <div className="project-tabs">
        <button
          className={`tab-button ${activeTab === "sessions" ? "active" : ""}`}
          onClick={() => setActiveTab("sessions")}
        >
          Sessions ({sessions.length})
        </button>
        <button
          className={`tab-button ${activeTab === "directory" ? "active" : ""}`}
          onClick={() => setActiveTab("directory")}
        >
          .claude Directory
        </button>
      </div>

      {activeTab === "sessions" ? (
        <div className="project-sessions-content">
          <div className="project-sessions-list">
            {sessions.length === 0 ? (
              <div className="no-sessions">
                No sessions found for this project
              </div>
            ) : (
              sessions.map((session) => (
                <div
                  key={session.session_id}
                  className={`session-item ${selectedSession?.session_id === session.session_id ? "selected" : ""}`}
                  onClick={() => loadSessionMessages(session)}
                >
                  <div className="session-header">
                    <h4>
                      Session {session.session_id.substring(0, 8)}...
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
                  </div>
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
                      Updated:{" "}
                      {new Date(session.timestamp).toLocaleDateString()}
                    </span>
                  </div>
                </div>
              ))
            )}
          </div>

          <div className="project-messages-panel">
            {selectedSession ? (
              <>
                <div className="messages-header">
                  <div className="messages-title">
                    <h3>
                      Messages for Session{" "}
                      {selectedSession.session_id.substring(0, 8)}...
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
                      </select>
                    </div>

                    <div className="markdown-toggle">
                      <label>
                        <input
                          type="checkbox"
                          checked={renderAsMarkdown}
                          onChange={(e) =>
                            setRenderAsMarkdown(e.target.checked)
                          }
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
                          {message.message_type !== "summary" &&
                            message.cwd && (
                              <div className="message-meta">
                                CWD: {message.cwd}
                              </div>
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
      ) : (
        <div className="project-directory-content">
          <div className="claude-directory-panel">
            <h3>Directory Information</h3>
            <div className="directory-info-item">
              <span className="info-label">Path:</span>
              <span className="info-value">{normalizedPath}/.claude</span>
            </div>
            <div className="directory-info-item">
              <span className="info-label">In Home Directory:</span>
              <span className="info-value">
                {inHomeDirectory ? "Yes" : "No"}
              </span>
            </div>
            <div className="directory-info-item">
              <span className="info-label">Project Root:</span>
              <span className="info-value">{normalizedPath}</span>
            </div>
            <h4>Directory Structure</h4>
            <div className="directory-structure">
              <pre>
                {`.claude/
├── projects/
│   └── ${projectPath}/
│       └── *.jsonl (session files)
├── todos/
│   └── ${projectPath}.json
├── command_history.log
└── settings.json`}
              </pre>
            </div>
          </div>
        </div>
      )}
    </div>
  );
};
