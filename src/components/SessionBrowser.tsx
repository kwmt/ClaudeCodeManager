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

      // Auto-scroll to the message containing the latest content preview
      if (data.length > 0 && session.latest_content_preview) {
        // Use setTimeout to ensure DOM is updated before scrolling
        setTimeout(() => {
          // Find the message that contains the preview text
          let targetMessage = null;
          let targetIndex = -1;

          // Search for the message containing the preview text
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

          // If no message found with preview, fall back to the last message
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
              // Highlight message briefly
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
        const updatedSession = data.find(s => s.session_id === currentSessionId);
        if (updatedSession) {
          await loadSessionMessages(updatedSession);
        }
      }
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to load sessions");
    } finally {
      setLoading(false);
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

  // Calculate diff statistics and generate line-by-line diff
  const generateDiff = (
    oldString: string,
    newString: string,
    filePath?: string,
  ) => {
    const oldLines = oldString.split("\n");
    const newLines = newString.split("\n");

    // Simple diff algorithm - find common prefix and suffix
    let commonPrefixLength = 0;
    const minLength = Math.min(oldLines.length, newLines.length);

    // Find common prefix
    while (
      commonPrefixLength < minLength &&
      oldLines[commonPrefixLength] === newLines[commonPrefixLength]
    ) {
      commonPrefixLength++;
    }

    // Find common suffix
    let commonSuffixLength = 0;
    while (
      commonSuffixLength < minLength - commonPrefixLength &&
      oldLines[oldLines.length - 1 - commonSuffixLength] ===
        newLines[newLines.length - 1 - commonSuffixLength]
    ) {
      commonSuffixLength++;
    }

    // Calculate removed and added lines
    const removedStart = commonPrefixLength;
    const removedEnd = oldLines.length - commonSuffixLength;
    const addedStart = commonPrefixLength;
    const addedEnd = newLines.length - commonSuffixLength;

    const removedLines = oldLines.slice(removedStart, removedEnd);
    const addedLines = newLines.slice(addedStart, addedEnd);

    // Generate unified diff view
    const diffLines: Array<{
      type: "context" | "removed" | "added";
      oldLineNum?: number;
      newLineNum?: number;
      content: string;
    }> = [];

    // Add context before changes (up to 3 lines)
    const contextStart = Math.max(0, commonPrefixLength - 3);
    for (let i = contextStart; i < commonPrefixLength; i++) {
      diffLines.push({
        type: "context",
        oldLineNum: i + 1,
        newLineNum: i + 1,
        content: oldLines[i],
      });
    }

    // Add removed lines
    for (let i = 0; i < removedLines.length; i++) {
      diffLines.push({
        type: "removed",
        oldLineNum: removedStart + i + 1,
        content: removedLines[i],
      });
    }

    // Add added lines
    for (let i = 0; i < addedLines.length; i++) {
      diffLines.push({
        type: "added",
        newLineNum: addedStart + i + 1,
        content: addedLines[i],
      });
    }

    // Add context after changes (up to 3 lines)
    const contextEndStart = oldLines.length - commonSuffixLength;
    const contextEndLimit = Math.min(contextEndStart + 3, oldLines.length);
    for (let i = contextEndStart; i < contextEndLimit; i++) {
      const newLineIndex = i - (oldLines.length - newLines.length);
      diffLines.push({
        type: "context",
        oldLineNum: i + 1,
        newLineNum: newLineIndex + 1,
        content: oldLines[i],
      });
    }

    return {
      filePath: filePath || "Unknown file",
      additions: addedLines.length,
      deletions: removedLines.length,
      diffLines,
    };
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
      const text = block.text;

      // Check if text looks like markdown (contains headers, lists, code blocks, inline code, emphasis)
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
      // Check if this is an Edit tool with old_string/new_string
      if (
        block.name === "Edit" &&
        block.input.old_string &&
        block.input.new_string
      ) {
        const diff = generateDiff(
          block.input.old_string,
          block.input.new_string,
          block.input.file_path,
        );

        return (
          <div key={index} className="tool-use-block diff-view">
            <div className="tool-header">
              <span className="tool-icon">⏺</span>
              <span className="tool-name">Update({diff.filePath})</span>
            </div>
            <div className="diff-summary">
              ⎿ Updated {diff.filePath} with {diff.additions} addition
              {diff.additions !== 1 ? "s" : ""} and {diff.deletions} removal
              {diff.deletions !== 1 ? "s" : ""}
            </div>
            <div className="diff-content unified-diff">
              {diff.diffLines.map((line, lineIndex) => (
                <div
                  key={lineIndex}
                  className={`diff-line diff-line-${line.type}`}
                >
                  <span className="line-numbers">
                    <span className="old-line-num">
                      {line.oldLineNum || ""}
                    </span>
                    <span className="new-line-num">
                      {line.newLineNum || ""}
                    </span>
                  </span>
                  <span className="diff-marker">
                    {line.type === "removed"
                      ? "-"
                      : line.type === "added"
                        ? "+"
                        : " "}
                  </span>
                  <pre className="diff-line-content">{line.content}</pre>
                </div>
              ))}
            </div>
          </div>
        );
      }

      // Check if this is a MultiEdit tool with edits array
      if (
        block.name === "MultiEdit" &&
        block.input.edits &&
        Array.isArray(block.input.edits)
      ) {
        const totalAdditions = block.input.edits.reduce(
          (sum: number, edit: any) => {
            const diff = generateDiff(
              edit.old_string || "",
              edit.new_string || "",
            );
            return sum + diff.additions;
          },
          0,
        );

        const totalDeletions = block.input.edits.reduce(
          (sum: number, edit: any) => {
            const diff = generateDiff(
              edit.old_string || "",
              edit.new_string || "",
            );
            return sum + diff.deletions;
          },
          0,
        );

        return (
          <div key={index} className="tool-use-block diff-view">
            <div className="tool-header">
              <span className="tool-icon">⏺</span>
              <span className="tool-name">
                MultiEdit({block.input.file_path || "Unknown file"})
              </span>
            </div>
            <div className="diff-summary">
              ⎿ Updated {block.input.file_path || "file"} with {totalAdditions}{" "}
              total addition{totalAdditions !== 1 ? "s" : ""} and{" "}
              {totalDeletions} total removal{totalDeletions !== 1 ? "s" : ""}{" "}
              across {block.input.edits.length} edit
              {block.input.edits.length !== 1 ? "s" : ""}
            </div>
            {block.input.edits.map((edit: any, editIndex: number) => {
              const diff = generateDiff(
                edit.old_string || "",
                edit.new_string || "",
                block.input.file_path,
              );
              return (
                <div key={editIndex} className="multi-edit-section">
                  <div className="diff-edit-number">
                    Edit {editIndex + 1} ({diff.additions} addition
                    {diff.additions !== 1 ? "s" : ""}, {diff.deletions} removal
                    {diff.deletions !== 1 ? "s" : ""})
                  </div>
                  <div className="diff-content unified-diff">
                    {diff.diffLines.map((line, lineIndex) => (
                      <div
                        key={lineIndex}
                        className={`diff-line diff-line-${line.type}`}
                      >
                        <span className="line-numbers">
                          <span className="old-line-num">
                            {line.oldLineNum || ""}
                          </span>
                          <span className="new-line-num">
                            {line.newLineNum || ""}
                          </span>
                        </span>
                        <span className="diff-marker">
                          {line.type === "removed"
                            ? "-"
                            : line.type === "added"
                              ? "+"
                              : " "}
                        </span>
                        <pre className="diff-line-content">{line.content}</pre>
                      </div>
                    ))}
                  </div>
                </div>
              );
            })}
          </div>
        );
      }

      // Default tool_use rendering
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
