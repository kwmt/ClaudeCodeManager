import React, { useEffect, useState, useRef, useCallback } from "react";
import { marked } from "marked";
import { api } from "../api";
import {
  normalizeProjectPathSync,
  getProjectDisplayName,
} from "../utils/pathUtils";
import { useToast, ToastContainer } from "./Toast";
import { formatDateTime, formatDateTooltip } from "../utils/dateUtils";
import type {
  ClaudeSession,
  ClaudeMessage,
  ContentBlock,
  ProjectSummary,
  ClaudeDirectoryInfo,
  ClaudeDirectoryFile,
} from "../types";

interface ProjectScreenProps {
  projectPath: string;
}

export const ProjectScreen: React.FC<ProjectScreenProps> = ({
  projectPath,
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
  const [claudeDirectoryInfo, setClaudeDirectoryInfo] =
    useState<ClaudeDirectoryInfo | null>(null);
  const [selectedFile, setSelectedFile] = useState<ClaudeDirectoryFile | null>(
    null,
  );
  const [fileContent, setFileContent] = useState<string>("");
  const [isEditingFile, setIsEditingFile] = useState(false);
  const [editedContent, setEditedContent] = useState<string>("");
  const [hasUnsavedChanges, setHasUnsavedChanges] = useState(false);
  const [cursorPosition, setCursorPosition] = useState({ line: 1, column: 1 });
  const [isLoading, setIsLoading] = useState(false);
  const [saveStatus, setSaveStatus] = useState<"saved" | "saving" | "unsaved">(
    "saved",
  );
  const [autoSaveEnabled, setAutoSaveEnabled] = useState(true);
  const textareaRef = useRef<HTMLTextAreaElement>(null);
  const autoSaveTimeoutRef = useRef<NodeJS.Timeout | null>(null);

  const [messageSearchQuery, setMessageSearchQuery] = useState("");
  const [selectedMessageType, setSelectedMessageType] = useState<string>("all");
  const [filteredMessages, setFilteredMessages] = useState<ClaudeMessage[]>([]);
  const [renderAsMarkdown, setRenderAsMarkdown] = useState(false);
  const messageListRef = useRef<HTMLDivElement>(null);
  const [isRefreshing, setIsRefreshing] = useState(false);

  // Toast notifications
  const toast = useToast();

  const normalizedPath = normalizeProjectPathSync(
    projectPath,
    knownProjectPaths,
  );
  const displayName = getProjectDisplayName(projectPath);

  // Helper function to detect file type
  const getFileType = (filename: string): string => {
    const ext = filename.split(".").pop()?.toLowerCase();
    switch (ext) {
      case "js":
      case "jsx":
        return "javascript";
      case "ts":
      case "tsx":
        return "typescript";
      case "json":
        return "json";
      case "py":
        return "python";
      case "sh":
      case "bash":
        return "shell";
      case "md":
        return "markdown";
      case "css":
        return "css";
      case "html":
        return "html";
      case "yaml":
      case "yml":
        return "yaml";
      case "toml":
        return "toml";
      case "xml":
        return "xml";
      default:
        return "text";
    }
  };

  // Helper function to update cursor position
  const updateCursorPosition = (textarea: HTMLTextAreaElement) => {
    const lines = textarea.value
      .substring(0, textarea.selectionStart)
      .split("\n");
    const line = lines.length;
    const column = lines[lines.length - 1].length + 1;
    setCursorPosition({ line, column });
  };

  useEffect(() => {
    loadProjectData();
  }, [projectPath]);

  useEffect(() => {
    if (activeTab === "directory") {
      loadClaudeDirectoryInfo();
    }
  }, [activeTab, normalizedPath]);

  useEffect(() => {
    if (isEditingFile && textareaRef.current) {
      // Focus the textarea and move cursor to end
      textareaRef.current.focus();
      const length = textareaRef.current.value.length;
      textareaRef.current.setSelectionRange(length, length);
      updateCursorPosition(textareaRef.current);
    }
  }, [isEditingFile]);

  // Track unsaved changes and handle auto-save
  useEffect(() => {
    const hasChanges = editedContent !== fileContent;
    setHasUnsavedChanges(hasChanges);
    setSaveStatus(hasChanges ? "unsaved" : "saved");

    // Auto-save functionality
    if (hasChanges && autoSaveEnabled && selectedFile && isEditingFile) {
      // Clear existing timeout
      if (autoSaveTimeoutRef.current) {
        clearTimeout(autoSaveTimeoutRef.current);
      }

      // Set new timeout for auto-save (3 seconds after last change)
      autoSaveTimeoutRef.current = setTimeout(() => {
        saveFileContent();
      }, 3000);
    }

    // Cleanup timeout on unmount
    return () => {
      if (autoSaveTimeoutRef.current) {
        clearTimeout(autoSaveTimeoutRef.current);
      }
    };
  }, [
    editedContent,
    fileContent,
    autoSaveEnabled,
    selectedFile,
    isEditingFile,
  ]);

  useEffect(() => {
    if (!messages.length) {
      // Don't clear filteredMessages when messages is empty - keep existing data
      return;
    }

    // Start with all messages (including summary messages)
    let filtered = messages;

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

        if (
          message.message_type !== "summary" &&
          "uuid" in message &&
          message.uuid.toLowerCase().includes(query)
        )
          return true;

        if (
          message.message_type !== "summary" &&
          "timestamp" in message &&
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

  const refreshProjectData = useCallback(async () => {
    try {
      setIsRefreshing(true);

      // Store the currently selected session ID before refresh
      const currentSessionId = selectedSession?.session_id;

      // Clear backend cache to ensure fresh data
      await api.clearCache();
      console.log("Backend cache cleared");

      await loadProjectData();

      // Refresh .claude directory info if on directory tab
      if (activeTab === "directory") {
        await loadClaudeDirectoryInfo();
      }

      // If there was a selected session, reload its messages with fresh session data
      if (currentSessionId) {
        try {
          // Get fresh sessions data immediately
          const allSessions = await api.getAllSessions();
          const projectSessions = allSessions.filter(
            (session) => session.project_path === projectPath,
          );

          // Find the updated session by ID
          const updatedSession = projectSessions.find(
            (session) => session.session_id === currentSessionId,
          );

          if (updatedSession) {
            console.log(
              "Refreshing messages for session:",
              updatedSession.session_id,
            );
            console.log(
              "Session file modified:",
              updatedSession.file_modified_time,
            );
            console.log("Session message count:", updatedSession.message_count);
            console.log("Current messages count:", messages.length);

            // Always reload messages on refresh to ensure we have the latest data
            await loadSessionMessages(updatedSession);
          }
        } catch (err) {
          console.error("Failed to refresh selected session messages:", err);
        }
      }

      toast.success(
        "Project data refreshed",
        "Latest data has been loaded successfully",
        2000,
      );
    } catch (err) {
      toast.error(
        "Refresh failed",
        err instanceof Error ? err.message : "Failed to refresh data",
        4000,
      );
    } finally {
      setIsRefreshing(false);
    }
  }, [activeTab, selectedSession, projectPath, toast]);

  // Keyboard shortcut for refresh
  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      if ((e.metaKey || e.ctrlKey) && e.key === "r") {
        e.preventDefault();
        refreshProjectData();
      }
    };

    window.addEventListener("keydown", handleKeyDown);
    return () => window.removeEventListener("keydown", handleKeyDown);
  }, [refreshProjectData]);

  const loadClaudeDirectoryInfo = async () => {
    try {
      const info = await api.getClaudeDirectoryInfo(normalizedPath);
      setClaudeDirectoryInfo(info);
    } catch (err) {
      console.error("Failed to load .claude directory info:", err);
    }
  };

  const loadFileContent = async (file: ClaudeDirectoryFile) => {
    try {
      setIsLoading(true);
      setSelectedFile(file);
      const content = await api.readClaudeFile(file.path);
      setFileContent(content);
      setEditedContent(content);
      setIsEditingFile(false);
      setHasUnsavedChanges(false);
      setSaveStatus("saved");
      setCursorPosition({ line: 1, column: 1 });
    } catch (err) {
      console.error("Failed to load file content:", err);
      setFileContent("Error loading file content");
    } finally {
      setIsLoading(false);
    }
  };

  const saveFileContent = async () => {
    if (!selectedFile) return;

    try {
      setSaveStatus("saving");
      await api.writeClaudeFile(selectedFile.path, editedContent);
      setFileContent(editedContent);
      setIsEditingFile(false);
      setHasUnsavedChanges(false);
      setSaveStatus("saved");

      // Show success toast
      toast.success(
        "File saved successfully",
        `${selectedFile.name} has been saved`,
        3000,
      );

      // Reload directory info to update modification times
      await loadClaudeDirectoryInfo();
    } catch (err) {
      console.error("Failed to save file:", err);
      setSaveStatus("unsaved");
      toast.error(
        "Failed to save file",
        err instanceof Error ? err.message : "Unknown error occurred",
        5000,
      );
    }
  };

  const formatFileSize = (bytes: number): string => {
    if (bytes === 0) return "0 B";
    const k = 1024;
    const sizes = ["B", "KB", "MB", "GB"];
    const i = Math.floor(Math.log(bytes) / Math.log(k));
    return parseFloat((bytes / Math.pow(k, i)).toFixed(2)) + " " + sizes[i];
  };

  const handleEditorKeyDown = (e: React.KeyboardEvent) => {
    // Update cursor position on key events
    if (textareaRef.current) {
      setTimeout(() => updateCursorPosition(textareaRef.current!), 0);
    }

    // Ctrl+S または Cmd+S で保存
    if ((e.ctrlKey || e.metaKey) && e.key === "s") {
      e.preventDefault();
      saveFileContent();
    }
    // Escキーでキャンセル
    if (e.key === "Escape") {
      if (hasUnsavedChanges) {
        const confirmDiscard = window.confirm(
          "未保存の変更があります。破棄しますか？",
        );
        if (!confirmDiscard) return;
      }
      setIsEditingFile(false);
      setEditedContent(fileContent);
    }
    // Tab key handling for proper indentation
    if (e.key === "Tab") {
      e.preventDefault();
      const textarea = e.currentTarget as HTMLTextAreaElement;
      const start = textarea.selectionStart;
      const end = textarea.selectionEnd;
      const spaces = "  "; // 2 spaces for indentation

      const newValue =
        editedContent.substring(0, start) +
        spaces +
        editedContent.substring(end);
      setEditedContent(newValue);

      // Set cursor position after the inserted spaces
      setTimeout(() => {
        textarea.selectionStart = textarea.selectionEnd = start + spaces.length;
      }, 0);
    }
  };

  const handleEditorChange = (e: React.ChangeEvent<HTMLTextAreaElement>) => {
    setEditedContent(e.target.value);
    updateCursorPosition(e.target);
  };

  const handleEditorClick = (e: React.MouseEvent<HTMLTextAreaElement>) => {
    updateCursorPosition(e.currentTarget);
  };

  const handleEditorSelection = (
    e: React.SyntheticEvent<HTMLTextAreaElement>,
  ) => {
    updateCursorPosition(e.currentTarget);
  };

  const loadSessionMessages = async (session: ClaudeSession) => {
    try {
      setLoadingMessages(true);
      setSelectedSession(session);
      const data = await api.getSessionMessages(session.session_id);
      setMessages(data);
      setFilteredMessages(data);

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
  ): React.ReactElement => {
    if (isMarkdown && renderAsMarkdown) {
      return (
        <div
          className="markdown-content"
          dangerouslySetInnerHTML={{
            __html: (() => {
              try {
                const result = marked(text);
                return typeof result === "string" ? result : "";
              } catch {
                return "";
              }
            })(),
          }}
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
        <div className="project-hero">
          <div className="project-title-section">
            <div className="project-title-with-refresh">
              <h1 className="project-title">{displayName}</h1>
              <button
                className="refresh-button"
                onClick={refreshProjectData}
                disabled={isRefreshing}
                aria-label="Refresh project data (Cmd+R)"
                title="Refresh project data (Cmd+R)"
              >
                🔄
              </button>
            </div>
            <p className="project-path" title={normalizedPath}>
              {normalizedPath}
            </p>
            {projectSummary && (
              <div
                className="project-last-activity"
                title={formatDateTooltip(projectSummary.last_activity)}
              >
                Last active{" "}
                {formatDateTime(projectSummary.last_activity, {
                  style: "compact",
                  showRelative: true,
                })}
              </div>
            )}
          </div>
          {projectSummary && (
            <div className="project-stats-horizontal">
              <div className="stat-card stat-card--sessions">
                <div className="stat-icon">💬</div>
                <div className="stat-content">
                  <div className="stat-value">
                    {projectSummary.session_count}
                  </div>
                  <div className="stat-label">Sessions</div>
                </div>
              </div>
              <div className="stat-card stat-card--messages">
                <div className="stat-icon">📝</div>
                <div className="stat-content">
                  <div className="stat-value">
                    {projectSummary.total_messages}
                  </div>
                  <div className="stat-label">Messages</div>
                </div>
              </div>
              <div
                className={`stat-card stat-card--todos ${projectSummary.active_todos > 0 ? "stat-card--warning" : ""}`}
              >
                <div className="stat-icon">
                  {projectSummary.active_todos > 0 ? "⚠️" : "✅"}
                </div>
                <div className="stat-content">
                  <div className="stat-value">
                    {projectSummary.active_todos}
                  </div>
                  <div className="stat-label">TODOs</div>
                </div>
              </div>
            </div>
          )}
        </div>
      </div>

      <div className="project-tabs">
        <button
          className={`tab-button ${activeTab === "sessions" ? "active" : ""}`}
          onClick={() => setActiveTab("sessions")}
          aria-label={`View sessions (${sessions.length} sessions)`}
        >
          <div className="tab-icon">💬</div>
          <div className="tab-content">
            <div className="tab-title">Sessions</div>
            <div className="tab-subtitle">{sessions.length} conversations</div>
          </div>
        </button>
        <button
          className={`tab-button ${activeTab === "directory" ? "active" : ""}`}
          onClick={() => setActiveTab("directory")}
          aria-label="View .claude directory files"
        >
          <div className="tab-icon">📁</div>
          <div className="tab-content">
            <div className="tab-title">.claude Directory</div>
            <div className="tab-subtitle">Project configuration</div>
          </div>
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
              sessions
                .sort(
                  (a, b) =>
                    new Date(b.file_modified_time).getTime() -
                    new Date(a.file_modified_time).getTime(),
                )
                .map((session) => (
                  <div
                    key={session.session_id}
                    className={`session-card ${selectedSession?.session_id === session.session_id ? "selected" : ""}`}
                    onClick={() => loadSessionMessages(session)}
                    role="button"
                    tabIndex={0}
                    aria-label={`Open session ${session.session_id.substring(0, 8)} with ${session.message_count} messages`}
                  >
                    <div className="session-card-header">
                      <div className="session-id-section">
                        <h4 className="session-title">
                          Session {session.session_id.substring(0, 8)}...
                        </h4>
                        <span
                          className={`session-status-badge ${session.is_processing ? "status-processing" : "status-completed"}`}
                          title={
                            session.is_processing
                              ? "Session has sequences still processing"
                              : "Session completed"
                          }
                          aria-label={
                            session.is_processing ? "Processing" : "Completed"
                          }
                        >
                          <span className="status-icon">
                            {session.is_processing ? "⏳" : "✅"}
                          </span>
                          {session.is_processing ? "Processing" : "Complete"}
                        </span>
                      </div>
                    </div>
                    {session.latest_content_preview && (
                      <div className="session-preview">
                        <p className="preview-text">
                          {session.latest_content_preview}
                        </p>
                      </div>
                    )}
                    <div className="session-card-meta">
                      <div className="meta-item">
                        <span className="meta-icon">💬</span>
                        <span className="meta-value">
                          {session.message_count}
                        </span>
                        <span className="meta-label">messages</span>
                      </div>
                      {session.git_branch && (
                        <div className="meta-item">
                          <span className="meta-icon">🌿</span>
                          <span className="meta-value">
                            {session.git_branch}
                          </span>
                          <span className="meta-label">branch</span>
                        </div>
                      )}
                      <div className="meta-item">
                        <span
                          className="meta-value"
                          title={formatDateTooltip(session.file_modified_time)}
                        >
                          {formatDateTime(session.file_modified_time, {
                            style: "compact",
                            showRelative: true,
                          })}
                        </span>
                        <span className="meta-label">updated</span>
                      </div>
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
                      Session {selectedSession.session_id.substring(0, 8)}...
                    </h3>
                    <div className="session-id-container">
                      <p>{selectedSession.session_id}</p>
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

                    <button
                      className="refresh-messages-button"
                      onClick={() => loadSessionMessages(selectedSession)}
                      disabled={loadingMessages}
                      title="Reload messages"
                    >
                      🔄
                    </button>
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
                            <span
                              className="message-time"
                              title={
                                message.message_type !== "summary"
                                  ? formatDateTooltip(message.timestamp)
                                  : undefined
                              }
                            >
                              {message.message_type === "summary"
                                ? ""
                                : formatDateTime(message.timestamp, {
                                    style: "technical",
                                  })}
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
          <div className="claude-directory-files">
            <h3>.claude Directory</h3>
            {claudeDirectoryInfo?.exists === false ? (
              <div className="no-claude-directory">
                <p>No .claude directory found in this project.</p>
                <p className="directory-path">
                  Expected at: {normalizedPath}/.claude
                </p>
              </div>
            ) : claudeDirectoryInfo?.files.length === 0 ? (
              <div className="empty-claude-directory">
                <p>.claude directory exists but is empty.</p>
              </div>
            ) : (
              <div className="files-list">
                {claudeDirectoryInfo?.files
                  .filter((file) => !file.is_directory)
                  .sort((a, b) => a.name.localeCompare(b.name))
                  .map((file) => (
                    <div
                      key={file.path}
                      className={`file-item ${selectedFile?.path === file.path ? "selected" : ""}`}
                      onClick={() => loadFileContent(file)}
                    >
                      <div className="file-info">
                        <span className="file-name">{file.name}</span>
                        <span className="file-size">
                          {formatFileSize(file.size)}
                        </span>
                        <span
                          className="file-modified"
                          title={formatDateTooltip(file.modified)}
                        >
                          {formatDateTime(file.modified, { style: "compact" })}
                        </span>
                      </div>
                    </div>
                  ))}
              </div>
            )}
          </div>

          {selectedFile && (
            <div
              className={`claude-file-viewer ${isEditingFile ? "edit-mode" : "view-mode"}`}
            >
              <div className="file-viewer-header">
                <div className="file-header-left">
                  <h4>{selectedFile.name}</h4>
                  <span
                    className={`mode-indicator ${isEditingFile ? "editing" : "viewing"}`}
                  >
                    {isEditingFile ? "編集中" : "ビューア"}
                  </span>
                  {hasUnsavedChanges && (
                    <span
                      className="unsaved-indicator"
                      title="未保存の変更があります"
                    >
                      ●
                    </span>
                  )}
                  {isEditingFile && (
                    <label className="auto-save-toggle">
                      <input
                        type="checkbox"
                        checked={autoSaveEnabled}
                        onChange={(e) => setAutoSaveEnabled(e.target.checked)}
                        aria-label="Auto-save enabled"
                      />
                      Auto-save
                    </label>
                  )}
                </div>
                <div className="file-actions">
                  {isEditingFile ? (
                    <>
                      <button
                        onClick={saveFileContent}
                        className="save-button"
                        disabled={!hasUnsavedChanges || saveStatus === "saving"}
                        aria-label="Save file (Ctrl+S)"
                        title="Save the current changes to the file"
                      >
                        {saveStatus === "saving" ? "Saving..." : "Save"}
                      </button>
                      <button
                        onClick={() => {
                          if (hasUnsavedChanges) {
                            const confirmDiscard = window.confirm(
                              "未保存の変更があります。破棄しますか？",
                            );
                            if (!confirmDiscard) return;
                          }
                          setIsEditingFile(false);
                          setEditedContent(fileContent);
                        }}
                        className="cancel-button"
                        aria-label="Cancel editing (Esc)"
                        title="Discard changes and exit edit mode"
                      >
                        Cancel
                      </button>
                    </>
                  ) : (
                    <button
                      onClick={() => setIsEditingFile(true)}
                      className="edit-button"
                      aria-label="Edit file"
                      title="Edit this file (Ctrl+S to save, Esc to cancel)"
                    >
                      Edit
                    </button>
                  )}
                </div>
              </div>
              <div className="file-content">
                {isLoading ? (
                  <div className="loading">Loading file content...</div>
                ) : isEditingFile ? (
                  <textarea
                    ref={textareaRef}
                    value={editedContent}
                    onChange={handleEditorChange}
                    onKeyDown={handleEditorKeyDown}
                    onClick={handleEditorClick}
                    onSelect={handleEditorSelection}
                    className={`file-editor ${hasUnsavedChanges ? "has-changes" : ""}`}
                    spellCheck={false}
                    placeholder="ファイルの内容を編集してください... (Ctrl+S で保存、Esc でキャンセル)"
                    aria-label={`Editing ${selectedFile.name}`}
                    aria-describedby="editor-status"
                    rows={20}
                  />
                ) : (
                  <pre className="file-viewer">{fileContent}</pre>
                )}
              </div>
              {isEditingFile && (
                <div
                  id="editor-status"
                  className="file-editor-status"
                  role="status"
                  aria-live="polite"
                >
                  <div className="status-left">
                    <span
                      className="file-type-indicator"
                      aria-label={`File type: ${getFileType(selectedFile.name)}`}
                    >
                      {getFileType(selectedFile.name)}
                    </span>
                    <span
                      className={`changes-indicator ${saveStatus === "saved" ? "saved" : ""}`}
                      aria-label="Save status"
                    >
                      <span className="changes-dot" aria-hidden="true"></span>
                      {saveStatus === "saving"
                        ? "Saving..."
                        : saveStatus === "unsaved"
                          ? autoSaveEnabled
                            ? "Auto-saving soon..."
                            : "Unsaved changes"
                          : "All changes saved"}
                    </span>
                  </div>
                  <div className="status-right">
                    <span
                      className="cursor-position"
                      aria-label="Cursor position"
                    >
                      Ln {cursorPosition.line}, Col {cursorPosition.column}
                    </span>
                    <span
                      className="keyboard-shortcuts-hint"
                      aria-label="Keyboard shortcuts"
                    >
                      Ctrl+S to save • Esc to cancel
                    </span>
                  </div>
                </div>
              )}
            </div>
          )}
        </div>
      )}

      {/* Toast notifications */}
      <ToastContainer toasts={toast.toasts} onDismiss={toast.dismissToast} />
    </div>
  );
};
