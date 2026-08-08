import { describe, it, expect, vi, beforeEach } from "vitest";
import {
  render,
  screen,
  fireEvent,
  waitFor,
  act,
} from "@testing-library/react";
import { PromptRunner } from "../PromptRunner";
import { api } from "../../api";
import type { PromptRunEvent } from "../../types";

vi.mock("../../api");
const mockApi = vi.mocked(api);

const RUN_ID = "run-1";

/** api.onPromptRunEvent に登録されたハンドラ（テストから疑似イベントを流す） */
let emit: ((event: PromptRunEvent) => void) | null = null;

/** マイクロタスクを flush して startPromptRun の解決を待つ */
const flush = async (): Promise<void> => {
  await act(async () => {
    await Promise.resolve();
  });
};

const typePrompt = (value: string): void => {
  const textarea = screen.getByLabelText("Claude への指示");
  fireEvent.change(textarea, { target: { value } });
};

const getSendButton = (): HTMLButtonElement =>
  screen.getByRole("button", { name: "送信" }) as HTMLButtonElement;

describe("PromptRunner", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    emit = null;

    mockApi.getClaudeCliStatus.mockResolvedValue({
      available: true,
      path: "/usr/local/bin/claude",
      version: "2.1.226 (Claude Code)",
    });
    mockApi.startPromptRun.mockResolvedValue(RUN_ID);
    mockApi.stopPromptRun.mockResolvedValue(undefined);
    mockApi.onPromptRunEvent.mockImplementation(async (handler) => {
      emit = handler;
      return () => {
        emit = null;
      };
    });
  });

  it("should render the composer when the CLI is available", async () => {
    render(<PromptRunner projectPath="/Users/john/projects/demo" />);

    await waitFor(() => {
      expect(
        screen.getByText("claude 2.1.226 (Claude Code)"),
      ).toBeInTheDocument();
    });

    expect(screen.getByLabelText("Claude への指示")).toBeInTheDocument();
    expect(screen.getByLabelText("権限モード")).toBeInTheDocument();
    expect(screen.getByLabelText("モデル")).toBeInTheDocument();
    expect(getSendButton()).toBeInTheDocument();
  });

  it("should disable the send button while the prompt is empty", async () => {
    render(<PromptRunner projectPath="/Users/john/projects/demo" />);

    await waitFor(() => {
      expect(getSendButton()).toBeDisabled();
    });

    typePrompt("テストのプロンプト");
    expect(getSendButton()).toBeEnabled();

    // 空白のみは送信不可
    typePrompt("   ");
    expect(getSendButton()).toBeDisabled();
  });

  it("should call startPromptRun with the expected arguments", async () => {
    render(<PromptRunner projectPath="/Users/john/projects/demo" />);

    await waitFor(() => {
      expect(getSendButton()).toBeInTheDocument();
    });

    typePrompt("README を要約して");
    fireEvent.click(getSendButton());

    await waitFor(() => {
      expect(mockApi.startPromptRun).toHaveBeenCalledWith({
        projectPath: "/Users/john/projects/demo",
        prompt: "README を要約して",
        permissionMode: "plan",
        resumeSessionId: null,
        model: null,
      });
    });

    expect(screen.getByText("README を要約して")).toBeInTheDocument();
    expect(screen.getByText("実行中…")).toBeInTheDocument();
  });

  it("should render assistant text received through onPromptRunEvent", async () => {
    render(<PromptRunner projectPath="/Users/john/projects/demo" />);

    await waitFor(() => {
      expect(mockApi.onPromptRunEvent).toHaveBeenCalled();
    });

    typePrompt("こんにちは");
    fireEvent.click(getSendButton());
    await waitFor(() => expect(mockApi.startPromptRun).toHaveBeenCalled());
    await flush();

    act(() => {
      emit?.({
        run_id: RUN_ID,
        kind: "message",
        payload: {
          type: "assistant",
          session_id: "aaaabbbb-cccc-dddd-eeee-ffff00001111",
          message: {
            role: "assistant",
            content: [{ type: "text", text: "こんにちは、手伝います。" }],
          },
        },
      });
    });

    await waitFor(() => {
      expect(screen.getByText("こんにちは、手伝います。")).toBeInTheDocument();
    });

    // session_id を保持して継続表示になる
    expect(screen.getByText("セッション継続中: aaaabbbb")).toBeInTheDocument();
  });

  it("should buffer events that arrive before startPromptRun resolves", async () => {
    // startPromptRun の resolve を意図的に遅延させ、run_id 確定前にイベントを流す
    let resolveStart: ((runId: string) => void) | null = null;
    mockApi.startPromptRun.mockImplementation(
      () =>
        new Promise<string>((resolve) => {
          resolveStart = resolve;
        }),
    );

    const onRunFinished = vi.fn();
    render(
      <PromptRunner
        projectPath="/Users/john/projects/demo"
        onRunFinished={onRunFinished}
      />,
    );

    await waitFor(() => {
      expect(mockApi.onPromptRunEvent).toHaveBeenCalled();
    });

    typePrompt("即座に終わる処理");
    fireEvent.click(getSendButton());
    await waitFor(() => expect(mockApi.startPromptRun).toHaveBeenCalled());

    // run_id 未確定（pending）の間に、起動直後に即死したプロセスを模して流す
    act(() => {
      emit?.({
        run_id: RUN_ID,
        kind: "message",
        payload: {
          type: "assistant",
          session_id: "99998888-7777-6666-5555-444433332222",
          message: {
            role: "assistant",
            content: [{ type: "text", text: "バッファされた最初の出力" }],
          },
        },
      });
      emit?.({
        run_id: RUN_ID,
        kind: "message",
        payload: {
          type: "assistant",
          message: {
            role: "assistant",
            content: [{ type: "text", text: "バッファされた次の出力" }],
          },
        },
      });
      emit?.({
        run_id: RUN_ID,
        kind: "exit",
        exit_code: 1,
        success: false,
      });
    });

    // まだ resolve していないので反映されず、実行中のまま
    expect(
      screen.queryByText("バッファされた最初の出力"),
    ).not.toBeInTheDocument();
    expect(screen.getByText("実行中…")).toBeInTheDocument();
    expect(onRunFinished).not.toHaveBeenCalled();

    // run_id が確定するとバッファが受信順どおりにフラッシュされる
    await act(async () => {
      resolveStart?.(RUN_ID);
      await Promise.resolve();
    });

    await waitFor(() => {
      expect(screen.getByText("バッファされた最初の出力")).toBeInTheDocument();
    });

    const log = screen.getByRole("log");
    const rendered = Array.from(
      log.querySelectorAll(".prompt-runner__markdown"),
    ).map((el) => el.textContent?.trim());
    expect(rendered).toEqual([
      "バッファされた最初の出力",
      "バッファされた次の出力",
    ]);

    // exit がバッファ経由で来ても実行中フラグは解除され onRunFinished が呼ばれる
    expect(screen.queryByText("実行中…")).not.toBeInTheDocument();
    expect(onRunFinished).toHaveBeenCalledTimes(1);
    expect(screen.getByText("異常終了（終了コード 1）")).toBeInTheDocument();
    expect(screen.getByText("セッション継続中: 99998888")).toBeInTheDocument();
  });

  it("should not double-process buffered events after the flush", async () => {
    let resolveStart: ((runId: string) => void) | null = null;
    mockApi.startPromptRun.mockImplementation(
      () =>
        new Promise<string>((resolve) => {
          resolveStart = resolve;
        }),
    );

    render(<PromptRunner projectPath="/Users/john/projects/demo" />);
    await waitFor(() => expect(mockApi.onPromptRunEvent).toHaveBeenCalled());

    typePrompt("重複確認");
    fireEvent.click(getSendButton());
    await waitFor(() => expect(mockApi.startPromptRun).toHaveBeenCalled());

    act(() => {
      emit?.({
        run_id: RUN_ID,
        kind: "message",
        payload: {
          type: "assistant",
          message: {
            role: "assistant",
            content: [{ type: "text", text: "一度だけ出るはず" }],
          },
        },
      });
    });

    await act(async () => {
      resolveStart?.(RUN_ID);
      await Promise.resolve();
    });

    await waitFor(() => {
      expect(screen.getByText("一度だけ出るはず")).toBeInTheDocument();
    });
    expect(screen.getAllByText("一度だけ出るはず")).toHaveLength(1);
  });

  it("should drop the buffer when startPromptRun rejects", async () => {
    let rejectStart: ((error: Error) => void) | null = null;
    mockApi.startPromptRun.mockImplementation(
      () =>
        new Promise<string>((_resolve, reject) => {
          rejectStart = reject;
        }),
    );

    render(<PromptRunner projectPath="/Users/john/projects/demo" />);
    await waitFor(() => expect(mockApi.onPromptRunEvent).toHaveBeenCalled());

    typePrompt("起動に失敗する");
    fireEvent.click(getSendButton());
    await waitFor(() => expect(mockApi.startPromptRun).toHaveBeenCalled());

    act(() => {
      emit?.({
        run_id: RUN_ID,
        kind: "message",
        payload: {
          type: "assistant",
          message: {
            role: "assistant",
            content: [{ type: "text", text: "捨てられるべき出力" }],
          },
        },
      });
    });

    await act(async () => {
      rejectStart?.(new Error("spawn failed"));
      await Promise.resolve();
    });

    await waitFor(() => {
      expect(
        screen.getByText("実行を開始できませんでした: spawn failed"),
      ).toBeInTheDocument();
    });
    expect(screen.queryByText("捨てられるべき出力")).not.toBeInTheDocument();
    expect(screen.queryByText("実行中…")).not.toBeInTheDocument();
  });

  it("should ignore mismatched run_id events once the run_id is settled", async () => {
    render(<PromptRunner projectPath="/Users/john/projects/demo" />);

    await waitFor(() => {
      expect(mockApi.onPromptRunEvent).toHaveBeenCalled();
    });

    typePrompt("こんにちは");
    fireEvent.click(getSendButton());
    await waitFor(() => expect(mockApi.startPromptRun).toHaveBeenCalled());
    await flush();

    act(() => {
      emit?.({
        run_id: "other-run",
        kind: "message",
        payload: {
          type: "assistant",
          message: {
            role: "assistant",
            content: [{ type: "text", text: "別の実行の出力" }],
          },
        },
      });
    });

    expect(screen.queryByText("別の実行の出力")).not.toBeInTheDocument();
  });

  it("should clear the running state and call onRunFinished on exit", async () => {
    const onRunFinished = vi.fn();
    render(
      <PromptRunner
        projectPath="/Users/john/projects/demo"
        onRunFinished={onRunFinished}
      />,
    );

    await waitFor(() => {
      expect(mockApi.onPromptRunEvent).toHaveBeenCalled();
    });

    typePrompt("ビルドして");
    fireEvent.click(getSendButton());
    await waitFor(() => expect(mockApi.startPromptRun).toHaveBeenCalled());
    await flush();

    expect(screen.getByText("実行中…")).toBeInTheDocument();

    act(() => {
      emit?.({
        run_id: RUN_ID,
        kind: "exit",
        exit_code: 0,
        success: true,
      });
    });

    await waitFor(() => {
      expect(screen.queryByText("実行中…")).not.toBeInTheDocument();
    });

    expect(onRunFinished).toHaveBeenCalledTimes(1);
    expect(screen.getByText("完了")).toBeInTheDocument();
  });

  it("should warn and disable sending when the CLI is unavailable", async () => {
    mockApi.getClaudeCliStatus.mockResolvedValue({
      available: false,
      error: "claude コマンドが見つかりませんでした。",
    });

    render(<PromptRunner projectPath="/Users/john/projects/demo" />);

    await waitFor(() => {
      expect(
        screen.getByText("claude コマンドが見つかりませんでした。"),
      ).toBeInTheDocument();
    });

    typePrompt("何かして");
    expect(getSendButton()).toBeDisabled();
    expect(mockApi.startPromptRun).not.toHaveBeenCalled();
  });

  it("should show an error row when startPromptRun rejects", async () => {
    mockApi.startPromptRun.mockRejectedValue(new Error("spawn failed"));

    render(<PromptRunner projectPath="/Users/john/projects/demo" />);

    await waitFor(() => {
      expect(getSendButton()).toBeInTheDocument();
    });

    typePrompt("実行して");
    fireEvent.click(getSendButton());

    await waitFor(() => {
      expect(
        screen.getByText("実行を開始できませんでした: spawn failed"),
      ).toBeInTheDocument();
    });

    expect(screen.queryByText("実行中…")).not.toBeInTheDocument();
  });

  it("should ask for confirmation before running in bypassPermissions mode", async () => {
    render(<PromptRunner projectPath="/Users/john/projects/demo" />);

    await waitFor(() => {
      expect(getSendButton()).toBeInTheDocument();
    });

    fireEvent.change(screen.getByLabelText("権限モード"), {
      target: { value: "bypassPermissions" },
    });
    typePrompt("危険な操作");
    fireEvent.click(getSendButton());

    expect(
      screen.getByText("全許可モードで実行しますか？"),
    ).toBeInTheDocument();
    expect(mockApi.startPromptRun).not.toHaveBeenCalled();

    fireEvent.click(screen.getByRole("button", { name: "実行する" }));

    await waitFor(() => {
      expect(mockApi.startPromptRun).toHaveBeenCalledWith(
        expect.objectContaining({ permissionMode: "bypassPermissions" }),
      );
    });
  });
});
