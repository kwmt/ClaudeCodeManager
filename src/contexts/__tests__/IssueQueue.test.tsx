/**
 * GitHub issue 対応キュー（issue #12）のテスト。
 * 複数 issue の順次実行・各 issue の独立セッション・キャンセルを確認する。
 */
import { render, act, waitFor } from "@testing-library/react";
import { vi, describe, it, expect, beforeEach } from "vitest";
import React from "react";
import {
  PromptRunsProvider,
  usePromptRuns,
  buildIssuePrompt,
} from "../PromptRunsContext";
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

let store: ReturnType<typeof usePromptRuns> | null = null;

const getStore = (): ReturnType<typeof usePromptRuns> => {
  if (!store) throw new Error("store is not mounted");
  return store;
};

const Harness: React.FC = () => {
  store = usePromptRuns();
  return null;
};

const PROJECT = "/Users/john/projects/alpha";

describe("Issue queue", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    handlers = new Set();
    store = null;

    let runSeq = 0;
    mockApi.startPromptRun.mockImplementation(async () => {
      runSeq += 1;
      return `run-${runSeq}`;
    });
    mockApi.onPromptRunEvent.mockImplementation(async (handler) => {
      handlers.add(handler);
      return () => {
        handlers.delete(handler);
      };
    });

    render(
      <PromptRunsProvider>
        <Harness />
      </PromptRunsProvider>,
    );
  });

  it("buildIssuePrompt は gh CLI の利用と PR 作成を指示する", () => {
    const prompt = buildIssuePrompt(42);
    expect(prompt).toContain("gh issue view 42");
    expect(prompt).toContain("close #42");
    expect(prompt).toContain("gh pr create");
  });

  it("複数 issue を順次実行し、各 issue は新しい会話で対応する", async () => {
    act(() => {
      getStore().startIssueRuns(PROJECT, [12, 34], "acceptEdits");
    });

    // 1 件目（#12）が送信される
    await waitFor(() => {
      expect(mockApi.startPromptRun).toHaveBeenCalledTimes(1);
    });
    expect(mockApi.startPromptRun).toHaveBeenLastCalledWith(
      expect.objectContaining({
        projectPath: PROJECT,
        prompt: expect.stringContaining("#12"),
        permissionMode: "acceptEdits",
        resumeSessionId: null,
      }),
    );

    // キュー表示: #12 が対応中、#34 が残り
    let queue = getStore().issueQueues.get(PROJECT);
    expect(queue?.active).toBe(12);
    expect(queue?.pending).toEqual([34]);

    // #12 の実行にセッションが付き、完了する
    emit({
      run_id: "run-1",
      kind: "message",
      payload: { type: "system", subtype: "init", session_id: "sess-issue-12" },
    });
    emit({ run_id: "run-1", kind: "exit", exit_code: 0, success: true });

    // 2 件目（#34）が新しい会話（resumeSessionId: null）で送信される
    await waitFor(() => {
      expect(mockApi.startPromptRun).toHaveBeenCalledTimes(2);
    });
    expect(mockApi.startPromptRun).toHaveBeenLastCalledWith(
      expect.objectContaining({
        prompt: expect.stringContaining("#34"),
        resumeSessionId: null,
      }),
    );

    queue = getStore().issueQueues.get(PROJECT);
    expect(queue?.active).toBe(34);
    expect(queue?.pending).toEqual([]);

    // #34 も完了するとキューは消える
    emit({ run_id: "run-2", kind: "exit", exit_code: 0, success: true });
    expect(getStore().issueQueues.get(PROJECT)).toBeUndefined();
  });

  it("残りをキャンセルすると未着手分だけ取り消される", async () => {
    act(() => {
      getStore().startIssueRuns(PROJECT, [12, 34, 56], "plan");
    });
    await waitFor(() => {
      expect(mockApi.startPromptRun).toHaveBeenCalledTimes(1);
    });

    act(() => {
      getStore().cancelIssueQueue(PROJECT);
    });

    // 実行中の #12 は残り、pending は空
    const queue = getStore().issueQueues.get(PROJECT);
    expect(queue?.active).toBe(12);
    expect(queue?.pending).toEqual([]);

    // #12 が終わってもキューは消え、次は実行されない
    emit({ run_id: "run-1", kind: "exit", exit_code: 0, success: true });
    expect(getStore().issueQueues.get(PROJECT)).toBeUndefined();
    expect(mockApi.startPromptRun).toHaveBeenCalledTimes(1);
  });

  it("起動失敗（CLI 不在等）でキューを止める", async () => {
    mockApi.startPromptRun.mockRejectedValue(new Error("claude not found"));

    act(() => {
      getStore().startIssueRuns(PROJECT, [12, 34], "plan");
    });

    await waitFor(() => {
      expect(getStore().issueQueues.get(PROJECT)).toBeUndefined();
    });
    // 2 件目は実行されない
    expect(mockApi.startPromptRun).toHaveBeenCalledTimes(1);
  });

  it("重複と不正な番号は除外される", async () => {
    act(() => {
      getStore().startIssueRuns(PROJECT, [12, 12, -1, 0, 34], "plan");
    });
    await waitFor(() => {
      expect(mockApi.startPromptRun).toHaveBeenCalledTimes(1);
    });
    const queue = getStore().issueQueues.get(PROJECT);
    expect(queue?.active).toBe(12);
    expect(queue?.pending).toEqual([34]);
  });
});
