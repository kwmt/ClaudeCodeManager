import React, {
  useCallback,
  useEffect,
  useMemo,
  useRef,
  useState,
} from "react";
import { marked } from "marked";
import { api } from "../api";
import {
  normalizeProjectPathSync,
  getProjectDisplayName,
} from "../utils/pathUtils";
import { useToast, ToastContainer } from "./Toast";
import { SafeConfirmDialog } from "./SafeConfirmDialog";
import { PromptRunner } from "./PromptRunner";
import { formatDateTime, formatDateTooltip } from "../utils/dateUtils";
import type {
  ClaudeSession,
  ClaudeMessage,
  ContentBlock,
  ProjectSummary,
  ClaudeDirectoryInfo,
  ClaudeDirectoryFile,
} from "../types";

/** セッション一覧の日付グループ見出し（今日 / 昨日 / 今週 / それ以前） */
const sessionDateGroup = (timestamp: string): string => {
  const startOfDay = (d: Date) =>
    new Date(d.getFullYear(), d.getMonth(), d.getDate()).getTime();
  const dayMs = 86_400_000;
  const today = startOfDay(new Date());
  const target = startOfDay(new Date(timestamp));
  if (target >= today) return "今日";
  if (target >= today - dayMs) return "昨日";
  if (target >= today - 6 * dayMs) return "今週";
  return "それ以前";
};

interface ProjectScreenProps {
  projectPath: string;
  /**
   * Prompt タブを開いた状態で表示するリクエスト（Dashboard / Prompts 一覧から）。
   * nonce が変わるたびに Prompt タブへ切り替える。0 は「リクエストなし」。
   */
  promptTabRequest?: { nonce: number };
}

export const ProjectScreen: React.FC<ProjectScreenProps> = ({
  projectPath,
  promptTabRequest,
}) => {
  const [sessions, setSessions] = useState<ClaudeSession[]>([]);
  // loadProjectData（再読込・プロジェクト切替）から最新の選択状態を
  // stale closure なしで参照するための ref
  const selectedSessionRef = useRef<ClaudeSession | null>(null);
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
  const [activeTab, setActiveTab] = useState<
    "sessions" | "directory" | "prompt"
  >("sessions");
  // Prompt タブを一度でも開いたか（開くまで PromptRunner をマウントしない）
  const [promptTabVisited, setPromptTabVisited] = useState(false);
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
  // 自動保存は既定 OFF。CLAUDE.md や settings.json への
  // 意図しない書き込み（3 秒後の自動反映）を防ぐ（明示保存が既定）
  const [autoSaveEnabled, setAutoSaveEnabled] = useState(false);
  const textareaRef = useRef<HTMLTextAreaElement>(null);
  const autoSaveTimeoutRef = useRef<NodeJS.Timeout | null>(null);

  // 未保存の変更を破棄する操作の確認（window.confirm の置き換え）
  const [discardConfirm, setDiscardConfirm] = useState<{
    action: () => void;
  } | null>(null);

  const [messageSearchQuery, setMessageSearchQuery] = useState("");
  const [sessionSearchQuery, setSessionSearchQuery] = useState("");
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

  // セッション一覧: 新しい順に整列し、検索語で絞り込む
  // （プレビュー本文・ブランチ・ID を対象にしたフロント側フィルタ）
  const visibleSessions = useMemo(() => {
    const sorted = [...sessions].sort(
      (a, b) =>
        new Date(b.file_modified_time).getTime() -
        new Date(a.file_modified_time).getTime(),
    );
    const query = sessionSearchQuery.trim().toLowerCase();
    if (!query) return sorted;
    return sorted.filter(
      (s) =>
        (s.latest_content_preview ?? "").toLowerCase().includes(query) ||
        s.session_id.toLowerCase().includes(query) ||
        (s.git_branch ?? "").toLowerCase().includes(query),
    );
  }, [sessions, sessionSearchQuery]);

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

  // Dashboard / Prompts 一覧からの「Prompt タブで開く」リクエストに応える
  const promptTabRequestNonce = promptTabRequest?.nonce ?? 0;
  useEffect(() => {
    if (promptTabRequestNonce > 0) {
      setPromptTabVisited(true);
      setActiveTab("prompt");
    }
  }, [promptTabRequestNonce]);

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

      // 未選択（またはプロジェクト切替で旧選択が無効）なら最新セッションを
      // 自動で開く。利用の大半は「最新のやり取りを見る」なので 1 クリック省く。
      // 再読込時に有効な選択があれば維持する（refreshProjectData が再選択する）
      const current = selectedSessionRef.current;
      const currentIsValid =
        current !== null &&
        projectSessions.some((s) => s.session_id === current.session_id);
      if (!currentIsValid && projectSessions.length > 0) {
        const latest = [...projectSessions].sort(
          (a, b) =>
            new Date(b.file_modified_time).getTime() -
            new Date(a.file_modified_time).getTime(),
        )[0];
        void loadSessionMessages(latest);
      }
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

  /**
   * プロンプト実行の完了後にセッション一覧だけを静かに更新する。
   *
   * loadProjectData は `loading` を立てて画面全体をローディング表示に
   * 差し替えるため、Prompt タブごと unmount され会話ログが消えてしまう。
   * ここでは表示を保ったままデータだけ差し替える。
   */
  const reloadSessionsQuietly = useCallback(async () => {
    try {
      await api.clearCache();
      const [allSessions, projectSummaries] = await Promise.all([
        api.getAllSessions(),
        api.getProjectSummary(),
      ]);
      setSessions(
        allSessions.filter((session) => session.project_path === projectPath),
      );
      setProjectSummary(
        projectSummaries.find((p) => p.project_path === projectPath) ?? null,
      );
    } catch (err) {
      console.error("Failed to refresh sessions after prompt run:", err);
    }
  }, [projectPath]);

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

  const doLoadFileContent = async (file: ClaudeDirectoryFile) => {
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

  /** 未保存の編集がある状態で別ファイルへ切り替える前に確認する */
  const loadFileContent = (file: ClaudeDirectoryFile) => {
    if (hasUnsavedChanges && selectedFile && selectedFile.path !== file.path) {
      setDiscardConfirm({ action: () => void doLoadFileContent(file) });
      return;
    }
    void doLoadFileContent(file);
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
        setDiscardConfirm({
          action: () => {
            setIsEditingFile(false);
            setEditedContent(fileContent);
          },
        });
        return;
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
      selectedSessionRef.current = session;
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
          {/*
            統計は 1 行のインラインメタに圧縮する。
            旧: カード 3 枚（約 100px + hover 演出のみでクリック不可の
            偽アフォーダンス）。ヘッダーを薄くしてコンテンツ領域を広げる。
          */}
          {projectSummary && (
            <div className="project-meta-line">
              <span>{projectSummary.session_count} sessions</span>
              <span aria-hidden="true">·</span>
              <span>{projectSummary.total_messages} messages</span>
              {projectSummary.active_todos > 0 && (
                <>
                  <span aria-hidden="true">·</span>
                  <span className="project-meta-line__todos">
                    {projectSummary.active_todos} TODO
                  </span>
                </>
              )}
            </div>
          )}
        </div>
      </div>

      {/* タブは 1 行に。サブタイトル（ヘッダー統計と食い違う件数表示）は出さない */}
      <div className="project-tabs">
        <button
          className={`tab-button ${activeTab === "sessions" ? "active" : ""}`}
          onClick={() => setActiveTab("sessions")}
          aria-label={`View sessions (${sessions.length} sessions)`}
        >
          Sessions
        </button>
        <button
          className={`tab-button ${activeTab === "directory" ? "active" : ""}`}
          onClick={() => setActiveTab("directory")}
          aria-label="View .claude directory files"
        >
          .claude Directory
        </button>
        <button
          className={`tab-button ${activeTab === "prompt" ? "active" : ""}`}
          onClick={() => {
            setPromptTabVisited(true);
            setActiveTab("prompt");
          }}
          aria-label="Run a prompt against this project"
        >
          Prompt
        </button>
      </div>

      {activeTab === "sessions" ? (
        <div className="project-sessions-content">
          <div className="project-sessions-list">
            {sessions.length > 0 && (
              <div className="session-list-search">
                <input
                  type="search"
                  className="session-list-search__input"
                  value={sessionSearchQuery}
                  onChange={(e) => setSessionSearchQuery(e.target.value)}
                  placeholder="セッションを検索（内容・ブランチ・ID）"
                  aria-label="セッションを検索"
                />
                {sessionSearchQuery && (
                  <span className="session-list-search__count">
                    {visibleSessions.length} 件
                  </span>
                )}
              </div>
            )}
            {sessions.length === 0 ? (
              <div className="no-sessions">
                <p>このプロジェクトにはまだセッションがありません。</p>
                <button
                  type="button"
                  className="no-sessions__cta"
                  onClick={() => {
                    setPromptTabVisited(true);
                    setActiveTab("prompt");
                  }}
                >
                  Prompt タブで Claude に指示を出す →
                </button>
              </div>
            ) : visibleSessions.length === 0 ? (
              <div className="no-sessions">
                <p>
                  「{sessionSearchQuery}」に一致するセッションはありません。
                </p>
              </div>
            ) : (
              visibleSessions.map((session, index) => {
                /*
                    カードの主見出しは会話内容のプレビュー（人は ID では
                    セッションを思い出せない — 記憶より認識）。ID は
                    メタ行の末尾に等幅で置く。バッジは処理中のみ表示
                    （正常状態にバッジは不要）。
                    一覧は「今日 / 昨日 / 今週 / それ以前」で見出しを挟む。
                  */
                const group = sessionDateGroup(session.file_modified_time);
                const prevGroup =
                  index > 0
                    ? sessionDateGroup(
                        visibleSessions[index - 1].file_modified_time,
                      )
                    : null;
                return (
                  <React.Fragment key={session.session_id}>
                    {group !== prevGroup && (
                      <div className="session-group-header">{group}</div>
                    )}
                    <div
                      className={`session-card ${selectedSession?.session_id === session.session_id ? "selected" : ""}`}
                      onClick={() => loadSessionMessages(session)}
                      onKeyDown={(e) => {
                        if (e.key === "Enter" || e.key === " ") {
                          e.preventDefault();
                          loadSessionMessages(session);
                        }
                      }}
                      role="button"
                      tabIndex={0}
                      aria-label={`Open session ${session.session_id.substring(0, 8)} with ${session.message_count} messages`}
                    >
                      <div className="session-card-title-row">
                        <h4 className="session-preview-title">
                          {session.latest_content_preview ??
                            `Session ${session.session_id.substring(0, 8)}`}
                        </h4>
                        {session.is_processing && (
                          <span
                            className="session-status-badge status-processing"
                            aria-label="Processing"
                          >
                            処理中
                          </span>
                        )}
                      </div>
                      <div className="session-card-meta">
                        <span
                          title={formatDateTooltip(session.file_modified_time)}
                        >
                          {formatDateTime(session.file_modified_time, {
                            style: "compact",
                            showRelative: true,
                          })}
                        </span>
                        <span aria-hidden="true">·</span>
                        <span>{session.message_count} msg</span>
                        {session.git_branch && (
                          <>
                            <span aria-hidden="true">·</span>
                            <span
                              className="session-card-meta__branch"
                              title={session.git_branch}
                            >
                              {session.git_branch}
                            </span>
                          </>
                        )}
                        <span className="session-card-meta__id">
                          {session.session_id.substring(0, 8)}
                        </span>
                      </div>
                    </div>
                  </React.Fragment>
                );
              })
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
                        title="JSONL ファイルを Finder で表示"
                        aria-label="JSONL ファイルを Finder で表示"
                      >
                        📂
                      </button>
                    </div>
                    {/* CWD はセッション内で不変なのでここに 1 回だけ表示する
                        （全メッセージへの繰り返しをやめた分の代替） */}
                    {(() => {
                      const cwd = messages.find(
                        (m) => m.message_type !== "summary" && m.cwd,
                      );
                      return cwd && cwd.message_type !== "summary" ? (
                        <p className="messages-cwd" title={cwd.cwd}>
                          CWD: {cwd.cwd}
                        </p>
                      ) : null;
                    })()}
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

                      // 日付が変わる箇所にだけ区切りを入れ、各行は時刻のみにする
                      // （同じ日付を全行に繰り返さない）
                      const messageDate =
                        message.message_type === "summary"
                          ? null
                          : new Date(message.timestamp).toDateString();
                      const prev =
                        index > 0 ? filteredMessages[index - 1] : null;
                      const prevDate =
                        prev && prev.message_type !== "summary"
                          ? new Date(prev.timestamp).toDateString()
                          : null;
                      const showDateSeparator =
                        messageDate !== null && messageDate !== prevDate;

                      const roleLabel =
                        message.message_type === "user"
                          ? "あなた"
                          : message.message_type === "assistant"
                            ? "Claude"
                            : "要約";
                      const statusText =
                        message.message_type !== "summary" &&
                        message.processing_status !== "completed"
                          ? message.processing_status === "processing"
                            ? "処理中"
                            : message.processing_status === "stopped"
                              ? "停止"
                              : "エラー"
                          : null;

                      return (
                        <React.Fragment key={messageId}>
                          {showDateSeparator &&
                            message.message_type !== "summary" && (
                              <div className="message-date-separator">
                                {new Date(message.timestamp).toLocaleDateString(
                                  "ja-JP",
                                  {
                                    year: "numeric",
                                    month: "long",
                                    day: "numeric",
                                  },
                                )}
                              </div>
                            )}
                          <div
                            id={`message-${messageId}`}
                            className={`message ${message.message_type.toLowerCase()}`}
                          >
                            <div className="message-header">
                              <span className="message-type">
                                {roleLabel}
                                {statusText && (
                                  <span
                                    className={`message-status-text message-status-text--${message.message_type !== "summary" ? message.processing_status : ""}`}
                                  >
                                    {statusText}
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
                                  : new Date(
                                      message.timestamp,
                                    ).toLocaleTimeString("ja-JP", {
                                      hour12: false,
                                    })}
                              </span>
                            </div>
                            {renderMessageContent(message)}
                          </div>
                        </React.Fragment>
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
      ) : activeTab === "prompt" ? null : (
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
                      onKeyDown={(e) => {
                        if (e.key === "Enter" || e.key === " ") {
                          e.preventDefault();
                          loadFileContent(file);
                        }
                      }}
                      role="button"
                      tabIndex={0}
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
                            setDiscardConfirm({
                              action: () => {
                                setIsEditingFile(false);
                                setEditedContent(fileContent);
                              },
                            });
                            return;
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

      {/*
        Prompt タブは一度開いたらマウントしたままにし、非表示にするだけにする。
        タブを行き来しても会話ログと実行中のセッションが失われないようにするため。
        未訪問のうちはマウントしない（CLI 検出のためのプロセス起動を避ける）。
      */}
      {promptTabVisited && (
        <div
          className="project-prompt-content"
          style={activeTab === "prompt" ? undefined : { display: "none" }}
        >
          <PromptRunner
            projectPath={normalizedPath}
            onRunFinished={reloadSessionsQuietly}
            onOpenSession={(sessionId) => {
              setActiveTab("sessions");
              const target = sessions.find((s) => s.session_id === sessionId);
              if (target) void loadSessionMessages(target);
            }}
          />
        </div>
      )}

      {/* 未保存変更の破棄確認 */}
      <SafeConfirmDialog
        isOpen={discardConfirm !== null}
        title="未保存の変更があります"
        message="このまま進むと編集中の内容は破棄されます。破棄してよろしいですか？"
        confirmText="破棄する"
        cancelText="編集に戻る"
        variant="warning"
        onConfirm={() => {
          discardConfirm?.action();
          setDiscardConfirm(null);
        }}
        onCancel={() => setDiscardConfirm(null)}
      />

      {/* Toast notifications */}
      <ToastContainer toasts={toast.toasts} onDismiss={toast.dismissToast} />
    </div>
  );
};
