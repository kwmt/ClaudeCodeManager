import { describe, it, expect, vi, beforeEach } from "vitest";
import { render, screen, fireEvent, waitFor } from "@testing-library/react";
import { ProjectScreen } from "../ProjectScreen";
import { api } from "../../api";
import { setPathMappingCache, setHomeDirCache } from "../../utils/pathUtils";

vi.mock("../../api");
const mockApi = vi.mocked(api);

const mockProjectSummary = {
  project_path: "-Users-john-documents-test-project",
  session_count: 3,
  last_activity: "2024-01-15T10:00:00Z",
  total_messages: 25,
  active_todos: 2,
};

const mockSessions = [
  {
    session_id: "session-123",
    project_path: "-Users-john-documents-test-project",
    timestamp: "2024-01-15T09:00:00Z",
    message_count: 10,
    git_branch: "main",
    latest_content_preview: "Test preview content",
    is_processing: false,
    file_modified_time: "2024-01-15T10:30:00Z",
  },
  {
    session_id: "session-456",
    project_path: "-Users-john-documents-test-project",
    timestamp: "2024-01-14T09:00:00Z",
    message_count: 15,
    git_branch: "feature/test",
    latest_content_preview: "Another preview",
    is_processing: true,
    file_modified_time: "2024-01-14T11:15:00Z",
  },
];

const mockMessages = [
  {
    uuid: "msg-1",
    session_id: "session-123",
    timestamp: "2024-01-15T09:30:00Z",
    message_type: "user" as const,
    content: { role: "user", content: "Hello, Claude!" },
    cwd: "/Users/john/documents/test-project",
    processing_status: "completed" as const,
  },
  {
    uuid: "msg-2",
    session_id: "session-123",
    timestamp: "2024-01-15T09:31:00Z",
    message_type: "assistant" as const,
    content: {
      role: "assistant",
      content: [{ type: "text" as const, text: "Hello! How can I help?" }],
    },
    cwd: "/Users/john/documents/test-project",
    processing_status: "completed" as const,
  },
];

describe("ProjectScreen", () => {
  beforeEach(() => {
    vi.clearAllMocks();

    // Set up path mapping cache for tests
    setPathMappingCache({
      "-Users-john-documents-test-project":
        "/Users/john.documents_test/project",
    });

    // Set up home directory cache for tests
    setHomeDirCache("/Users/john.documents_test");
    mockApi.getAllSessions.mockResolvedValue(mockSessions);
    mockApi.getProjectSummary.mockResolvedValue([mockProjectSummary]);
    mockApi.getSessionMessages.mockResolvedValue(mockMessages);
    mockApi.getClaudeDirectoryInfo.mockResolvedValue({
      path: "/Users/john.documents_test/project/.claude",
      exists: true,
      files: [],
    });
  });

  it("should render project information correctly", async () => {
    render(<ProjectScreen projectPath="-Users-john-documents-test-project" />);

    await waitFor(() => {
      expect(screen.getByText("project")).toBeInTheDocument();
    });

    expect(
      screen.getByText("/Users/john.documents_test/project"),
    ).toBeInTheDocument();
    // ヘッダー統計は 1 行のインラインメタ
    expect(screen.getByText("3 sessions")).toBeInTheDocument();
    expect(screen.getByText("25 messages")).toBeInTheDocument();
    expect(screen.getByText("2 TODO")).toBeInTheDocument();
  });

  it("should display .claude directory information when tab is clicked", async () => {
    render(<ProjectScreen projectPath="-Users-john-documents-test-project" />);

    await waitFor(() => {
      expect(screen.getByText(".claude Directory")).toBeInTheDocument();
    });

    // Click on .claude Directory tab
    fireEvent.click(screen.getByText(".claude Directory"));

    await waitFor(() => {
      expect(
        screen.getByRole("heading", { name: ".claude Directory" }),
      ).toBeInTheDocument();
    });

    // Verify that the empty directory message is shown since we mocked an empty directory.
    // ディレクトリ情報は非同期取得のため、見出し表示より遅れて描画される
    // （遅い CI ランナーで顕在化するレース）。waitFor で解決を待つ。
    await waitFor(() => {
      expect(
        screen.getByText(".claude directory exists but is empty."),
      ).toBeInTheDocument();
    });
  });

  it("should render sessions list", async () => {
    render(<ProjectScreen projectPath="-Users-john-documents-test-project" />);

    // プレビュー本文がカードの主見出しになる
    await waitFor(() => {
      expect(screen.getByText("Test preview content")).toBeInTheDocument();
    });
    expect(screen.getByText("Another preview")).toBeInTheDocument();
    // ID はメタ行の等幅サブテキストに降格（8 文字切り詰めで両カードとも "session-"）
    expect(screen.getAllByText("session-")).toHaveLength(2);
  });

  it("should auto-select the latest session and load its messages", async () => {
    render(<ProjectScreen projectPath="-Users-john-documents-test-project" />);

    // 最新セッション（file_modified_time が新しい方）が自動で開く
    await waitFor(() => {
      expect(mockApi.getSessionMessages).toHaveBeenCalled();
    });

    // カードをクリックすれば任意のセッションへ切り替えられる
    await waitFor(() => {
      expect(screen.getByText("Test preview content")).toBeInTheDocument();
    });
    fireEvent.click(screen.getByText("Test preview content"));

    await waitFor(() => {
      expect(mockApi.getSessionMessages).toHaveBeenCalledWith("session-123");
    });

    await waitFor(() => {
      const messagesHeader = screen.getByText(/Session session-.../, {
        selector: ".messages-title h3",
      });
      expect(messagesHeader).toBeInTheDocument();
    });
  });

  it("should handle loading and error states", async () => {
    render(<ProjectScreen projectPath="-Users-john-documents-test-project" />);

    expect(screen.getByText("Loading project...")).toBeInTheDocument();

    await waitFor(() => {
      expect(screen.queryByText("Loading project...")).not.toBeInTheDocument();
    });
  });

  it("should handle error state", async () => {
    mockApi.getAllSessions.mockRejectedValue(
      new Error("Failed to load sessions"),
    );

    render(<ProjectScreen projectPath="-Users-john-documents-test-project" />);

    await waitFor(() => {
      expect(screen.getByText("Error loading project")).toBeInTheDocument();
    });

    expect(screen.getByText("Failed to load sessions")).toBeInTheDocument();
  });
});
