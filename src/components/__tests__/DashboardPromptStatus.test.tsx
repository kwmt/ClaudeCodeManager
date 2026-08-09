/**
 * Dashboard の「プロンプト実行状況」セクションと
 * プロジェクトカードの直近アクティビティ行のテスト。
 */
import {
  render,
  screen,
  fireEvent,
  waitFor,
  act,
} from "@testing-library/react";
import { vi, describe, it, expect, beforeEach } from "vitest";
import React from "react";
import { Dashboard } from "../Dashboard";
import {
  PromptRunsProvider,
  usePromptRuns,
  type RegisterRunMeta,
} from "../../contexts/PromptRunsContext";
import { api } from "../../api";
import type { PromptRunEvent } from "../../types";

vi.mock("../../api");
const mockApi = vi.mocked(api);

let handlers: Set<(event: PromptRunEvent) => void> = new Set();

const emit = (event: PromptRunEvent): void => {
  act(() => {
    for (const handler of handlers) handler(event);
  });
};

let registerRun: ((runId: string, meta: RegisterRunMeta) => void) | null = null;

const Harness: React.FC = () => {
  const store = usePromptRuns();
  registerRun = store.registerRun;
  return null;
};

const register = (runId: string, projectPath: string, prompt: string) => {
  act(() => {
    registerRun?.(runId, {
      projectPath,
      prompt,
      permissionMode: "plan",
      model: null,
    });
  });
};

const STATS = {
  total_sessions: 1,
  total_messages: 1,
  total_commands: 0,
  active_projects: 1,
  pending_todos: 0,
};

const PROJECTS = [
  {
    project_path: "/Users/john/projects/alpha",
    session_count: 1,
    last_activity: "2026-08-01T10:00:00Z",
    total_messages: 1,
    active_todos: 0,
  },
];

describe("Dashboard prompt status board", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    handlers = new Set();
    registerRun = null;

    mockApi.getSessionStats.mockResolvedValue(STATS);
    mockApi.getProjectSummary.mockResolvedValue(PROJECTS);
    mockApi.getAllSessions.mockResolvedValue([]);
    mockApi.stopPromptRun.mockResolvedValue(undefined);
    mockApi.onPromptRunEvent.mockImplementation(async (handler) => {
      handlers.add(handler);
      return () => {
        handlers.delete(handler);
      };
    });
  });

  const renderDashboard = (
    props: Partial<React.ComponentProps<typeof Dashboard>> = {},
  ) =>
    render(
      <PromptRunsProvider>
        <Harness />
        <Dashboard {...props} />
      </PromptRunsProvider>,
    );

  it("実行が無いときはセクションを表示しない", async () => {
    renderDashboard();
    await waitFor(() => {
      expect(screen.getByText("Recent Projects")).toBeInTheDocument();
    });
    expect(screen.queryByText("プロンプト実行状況")).not.toBeInTheDocument();
  });

  it("実行中・完了が件数チップ付きで一覧表示される", async () => {
    renderDashboard();
    await waitFor(() => {
      expect(screen.getByText("Recent Projects")).toBeInTheDocument();
    });

    register("run-1", "/Users/john/projects/alpha", "テストを追加して");
    register("run-2", "/Users/john/projects/beta", "READMEを更新して");
    emit({ run_id: "run-1", kind: "exit", exit_code: 0, success: true });

    expect(screen.getByText("プロンプト実行状況")).toBeInTheDocument();
    expect(screen.getByText(/実行中\s*1/)).toBeInTheDocument();
    expect(screen.getByText(/完了\s*1/)).toBeInTheDocument();
    // alpha は PROJECTS にあるためカードにも表示され、複数一致になりうる
    expect(screen.getAllByText("テストを追加して").length).toBeGreaterThan(0);
    expect(screen.getAllByText("READMEを更新して").length).toBeGreaterThan(0);
  });

  it("すべて見るで onOpenPromptsTab が呼ばれる", async () => {
    const onOpenPromptsTab = vi.fn();
    renderDashboard({ onOpenPromptsTab });
    await waitFor(() => {
      expect(screen.getByText("Recent Projects")).toBeInTheDocument();
    });

    register("run-1", "/Users/john/projects/alpha", "テストを追加して");

    fireEvent.click(screen.getByRole("button", { name: "すべて見る →" }));
    expect(onOpenPromptsTab).toHaveBeenCalledTimes(1);
  });

  it("プロジェクトカードに直近の実行プロンプトが表示される", async () => {
    renderDashboard();
    await waitFor(() => {
      expect(screen.getByText("Recent Projects")).toBeInTheDocument();
    });

    register("run-1", "/Users/john/projects/alpha", "カードに出るはず");
    emit({ run_id: "run-1", kind: "exit", exit_code: 0, success: true });

    // セクションの行とカードの行の 2 箇所に出る
    expect(
      screen.getAllByText("カードに出るはず").length,
    ).toBeGreaterThanOrEqual(2);
  });

  it("実行が無いプロジェクトのカードには最新セッションのプレビューが出る", async () => {
    mockApi.getAllSessions.mockResolvedValue([
      {
        session_id: "s-1",
        project_path: "/Users/john/projects/alpha",
        timestamp: "2026-08-01T10:00:00Z",
        message_count: 3,
        is_processing: false,
        file_modified_time: "2026-08-01T10:30:00Z",
        latest_content_preview: "最後にやり取りした内容のプレビュー",
      },
    ]);

    renderDashboard();
    await waitFor(() => {
      expect(
        screen.getByText("最後にやり取りした内容のプレビュー"),
      ).toBeInTheDocument();
    });
  });

  it("実行が無いプロジェクトのカードには「プロンプト未実行」が出る", async () => {
    renderDashboard();
    await waitFor(() => {
      expect(screen.getByText("Recent Projects")).toBeInTheDocument();
    });
    expect(screen.getByText("プロンプト未実行")).toBeInTheDocument();
  });

  it("カードのクイック実行からプロンプトを送信できる", async () => {
    mockApi.startPromptRun.mockResolvedValue("run-quick");
    renderDashboard();
    await waitFor(() => {
      expect(screen.getByText("Recent Projects")).toBeInTheDocument();
    });

    // 「▷ プロンプトを実行…」を開いて送信
    fireEvent.click(
      screen.getByRole("button", { name: "alpha にプロンプトを実行" }),
    );
    const textarea = screen.getByPlaceholderText(
      "Claude への指示…（Cmd/Ctrl + Enter で送信）",
    );
    fireEvent.change(textarea, { target: { value: "カードから実行" } });
    fireEvent.click(screen.getByRole("button", { name: "送信" }));

    await waitFor(() => {
      expect(mockApi.startPromptRun).toHaveBeenCalledWith({
        projectPath: "/Users/john/projects/alpha",
        prompt: "カードから実行",
        permissionMode: "plan",
        resumeSessionId: null,
        model: null,
      });
    });

    // 送信後は実行中としてカード・セクションに反映される
    expect(screen.getByText("プロンプト実行状況")).toBeInTheDocument();
    expect(screen.getAllByText("カードから実行").length).toBeGreaterThanOrEqual(
      1,
    );
    // 実行中のカードにはコンポーザーを出さない
    expect(
      screen.queryByRole("button", { name: "alpha にプロンプトを実行" }),
    ).not.toBeInTheDocument();
  });

  it("クイック実行の起動失敗はカード内にエラー表示される", async () => {
    mockApi.startPromptRun.mockRejectedValue(new Error("spawn failed"));
    renderDashboard();
    await waitFor(() => {
      expect(screen.getByText("Recent Projects")).toBeInTheDocument();
    });

    fireEvent.click(
      screen.getByRole("button", { name: "alpha にプロンプトを実行" }),
    );
    fireEvent.change(
      screen.getByPlaceholderText(
        "Claude への指示…（Cmd/Ctrl + Enter で送信）",
      ),
      { target: { value: "失敗するはず" } },
    );
    fireEvent.click(screen.getByRole("button", { name: "送信" }));

    await waitFor(() => {
      expect(
        screen.getByText(/実行を開始できませんでした: spawn failed/),
      ).toBeInTheDocument();
    });
  });
});
