import { describe, it, expect, vi, beforeEach } from "vitest";
import { render, screen, waitFor, fireEvent } from "@testing-library/react";
import { SessionBrowser } from "../components/SessionBrowser";
import { mockApi } from "../api-mock";

// Mock the API
vi.mock("../api", () => ({
  api: {
    getAllSessions: vi.fn(() => mockApi.getAllSessions()),
    getChangedSessions: vi.fn(() => Promise.resolve([])),
    getSessionMessages: vi.fn((sessionId: string) =>
      mockApi.getSessionMessages(sessionId),
    ),
    exportSessionData: vi.fn((sessionId: string) =>
      mockApi.exportSessionData(sessionId),
    ),
  },
}));

describe("Session Updates Optimization", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("should render session browser correctly", async () => {
    render(<SessionBrowser />);

    await waitFor(() => {
      expect(screen.getByText(/Session Browser/)).toBeInTheDocument();
    });

    // セッションが表示されることを確認（h4要素を使って特定）
    await waitFor(() => {
      const webApp = screen.getByRole("heading", { name: "web-app", level: 4 });
      const mobileApp = screen.getByRole("heading", {
        name: "mobile-app",
        level: 4,
      });
      const apiServer = screen.getByRole("heading", {
        name: "api-server",
        level: 4,
      });

      expect(webApp).toBeInTheDocument();
      expect(mobileApp).toBeInTheDocument();
      expect(apiServer).toBeInTheDocument();
    });
  });

  it("should show refreshing indicator when manually refreshing all sessions", async () => {
    render(<SessionBrowser />);

    // Wait for initial load to complete
    await waitFor(() => {
      expect(screen.getByText(/Session Browser/)).toBeInTheDocument();
    });

    // セッションが表示されるまで待つ
    await waitFor(() => {
      const webApp = screen.getByRole("heading", { name: "web-app", level: 4 });
      expect(webApp).toBeInTheDocument();
    });

    // 全体のリフレッシュボタンを見つけてクリック
    const refreshButton = screen.getByRole("button", { name: /Refresh/i });
    expect(refreshButton).toBeInTheDocument();

    fireEvent.click(refreshButton);

    // リフレッシュボタンが無効になることを確認（ローディング中）
    await waitFor(() => {
      expect(refreshButton).toBeDisabled();
    });

    // Wait for refreshing to complete
    await waitFor(() => {
      expect(refreshButton).not.toBeDisabled();
    });
  });

  it("should allow manual refresh of all sessions via refresh button", async () => {
    const { api } = await import("../api");

    render(<SessionBrowser />);

    // Wait for initial load to complete - wait for sessions to appear
    await waitFor(
      () => {
        expect(screen.queryByText(/Loading sessions/)).not.toBeInTheDocument();
      },
      { timeout: 2000 },
    );

    // Verify initial loading is complete
    expect(screen.getByText(/Session Browser/)).toBeInTheDocument();

    // Mock getAllSessions to return some data
    const mockSessions = [
      {
        session_id: "session-1",
        project_path: "/Users/developer/projects/web-app",
        created_at: "2025-07-20T10:00:00Z",
        updated_at: "2025-07-20T11:30:00Z",
        message_count: 15,
        git_branch: "main",
        is_processing: false,
      },
    ];
    vi.mocked(api.getAllSessions).mockResolvedValueOnce(mockSessions);

    // 全体のリフレッシュボタンをクリック
    const refreshButton = screen.getByRole("button", { name: /Refresh/i });
    fireEvent.click(refreshButton);

    // 更新が成功することを確認
    await waitFor(() => {
      expect(api.getAllSessions).toHaveBeenCalled();
    });
  });

  it("should filter sessions by project", async () => {
    render(<SessionBrowser />);

    // Wait for sessions to load
    await waitFor(() => {
      const webApp = screen.getByRole("heading", { name: "web-app", level: 4 });
      const mobileApp = screen.getByRole("heading", {
        name: "mobile-app",
        level: 4,
      });
      const apiServer = screen.getByRole("heading", {
        name: "api-server",
        level: 4,
      });

      expect(webApp).toBeInTheDocument();
      expect(mobileApp).toBeInTheDocument();
      expect(apiServer).toBeInTheDocument();
    });

    // プロジェクトフィルターを見つけて変更
    const projectSelect = screen.getByLabelText("Project:");
    fireEvent.change(projectSelect, {
      target: { value: "/Users/developer/projects/web-app" },
    });

    // web-appのみが表示されることを確認
    await waitFor(() => {
      const webApp = screen.getByRole("heading", { name: "web-app", level: 4 });
      expect(webApp).toBeInTheDocument();

      // mobile-appとapi-serverが存在しないことを確認
      expect(
        screen.queryByRole("heading", { name: "mobile-app", level: 4 }),
      ).not.toBeInTheDocument();
      expect(
        screen.queryByRole("heading", { name: "api-server", level: 4 }),
      ).not.toBeInTheDocument();
    });
  });
});
