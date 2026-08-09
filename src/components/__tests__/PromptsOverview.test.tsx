import { describe, it, expect, vi, beforeEach } from "vitest";
import {
  render,
  screen,
  fireEvent,
  waitFor,
  act,
} from "@testing-library/react";
import React from "react";
import { PromptsOverview } from "../PromptsOverview";
import {
  PromptRunsProvider,
  usePromptRuns,
  type RegisterRunMeta,
} from "../../contexts/PromptRunsContext";
import { api } from "../../api";
import type { PromptRunEvent } from "../../types";

vi.mock("../../api");
const mockApi = vi.mocked(api);

/** api.onPromptRunEvent に登録された全ハンドラ（Provider が購読する） */
let handlers: Set<(event: PromptRunEvent) => void> = new Set();

const emit = (event: PromptRunEvent): void => {
  act(() => {
    for (const handler of handlers) handler(event);
  });
};

/** Provider 配下から registerRun を呼び出すためのテスト用ハーネス */
let registerRun: ((runId: string, meta: RegisterRunMeta) => void) | null = null;

const Harness: React.FC = () => {
  const store = usePromptRuns();
  registerRun = store.registerRun;
  return null;
};

const renderOverview = (onOpenProject = vi.fn()) => {
  const result = render(
    <PromptRunsProvider>
      <Harness />
      <PromptsOverview onOpenProject={onOpenProject} />
    </PromptRunsProvider>,
  );
  return { ...result, onOpenProject };
};

const register = (runId: string, projectPath = "/Users/john/projects/demo") => {
  act(() => {
    registerRun?.(runId, {
      projectPath,
      prompt: "テストを追加して",
      permissionMode: "plan",
      model: null,
    });
  });
};

describe("PromptsOverview", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    handlers = new Set();
    registerRun = null;

    mockApi.stopPromptRun.mockResolvedValue(undefined);
    mockApi.onPromptRunEvent.mockImplementation(async (handler) => {
      handlers.add(handler);
      return () => {
        handlers.delete(handler);
      };
    });
  });

  it("実行が無いときは空状態を表示する", () => {
    renderOverview();
    expect(
      screen.getByText(/まだプロンプトを実行していません/),
    ).toBeInTheDocument();
  });

  it("登録した実行が実行中として表示される", () => {
    renderOverview();
    register("run-1");

    expect(screen.getByText("demo")).toBeInTheDocument();
    expect(screen.getByText("テストを追加して")).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "停止" })).toBeInTheDocument();
  });

  it("exit イベントで完了に変わり停止ボタンが消える", () => {
    renderOverview();
    register("run-1");

    emit({ run_id: "run-1", kind: "exit", exit_code: 0, success: true });

    expect(screen.getByLabelText("完了")).toBeInTheDocument();
    expect(
      screen.queryByRole("button", { name: "停止" }),
    ).not.toBeInTheDocument();
  });

  it("終了コード 143 は停止として扱う", () => {
    renderOverview();
    register("run-1");

    emit({ run_id: "run-1", kind: "exit", exit_code: 143, success: false });

    expect(screen.getByLabelText("停止")).toBeInTheDocument();
  });

  it("登録前に届いたイベントも登録後に反映される", () => {
    renderOverview();

    // registerRun より先にイベントが届く（startPromptRun resolve 前のレース）
    emit({
      run_id: "run-1",
      kind: "message",
      payload: {
        type: "assistant",
        session_id: "sess-1",
        message: {
          role: "assistant",
          content: [
            {
              type: "tool_use",
              id: "t1",
              name: "Read",
              input: { file_path: "src/api.ts" },
            },
          ],
        },
      },
    });
    emit({ run_id: "run-1", kind: "exit", exit_code: 1, success: false });

    register("run-1");

    // バッファされたイベントが順に適用され、失敗として表示される
    expect(screen.getByLabelText("失敗")).toBeInTheDocument();
    expect(screen.getByText(/終了コード 1/)).toBeInTheDocument();
  });

  it("フィルタで絞り込める", () => {
    renderOverview();
    register("run-1", "/Users/john/projects/alpha");
    register("run-2", "/Users/john/projects/beta");
    emit({ run_id: "run-2", kind: "exit", exit_code: 0, success: true });

    // 完了フィルタ → beta のみ
    fireEvent.click(screen.getByRole("button", { name: /完了/ }));
    expect(screen.queryByText("alpha")).not.toBeInTheDocument();
    expect(screen.getByText("beta")).toBeInTheDocument();

    // 実行中フィルタ → alpha のみ
    fireEvent.click(screen.getByRole("button", { name: /実行中/ }));
    expect(screen.getByText("alpha")).toBeInTheDocument();
    expect(screen.queryByText("beta")).not.toBeInTheDocument();
  });

  it("開くで onOpenProject が呼ばれる", () => {
    const { onOpenProject } = renderOverview();
    register("run-1", "/Users/john/projects/alpha");

    fireEvent.click(screen.getByRole("button", { name: "開く" }));
    expect(onOpenProject).toHaveBeenCalledWith("/Users/john/projects/alpha");
  });

  it("停止で api.stopPromptRun が呼ばれる", async () => {
    renderOverview();
    register("run-1");

    fireEvent.click(screen.getByRole("button", { name: "停止" }));
    await waitFor(() => {
      expect(mockApi.stopPromptRun).toHaveBeenCalledWith("run-1");
    });
  });
});
