/**
 * PromptRunsContext の永続化（localStorage）のテスト。
 * アプリ再起動（Provider の破棄と再マウント）をまたいで、
 * 実行履歴・会話ログ・セッション紐付けが復元されることを確認する。
 */
import { render, act } from "@testing-library/react";
import { vi, describe, it, expect, beforeEach } from "vitest";
import React from "react";
import { PromptRunsProvider, usePromptRuns } from "../PromptRunsContext";
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

/** Provider 配下のストアを外から観測・操作するためのハーネス */
let store: ReturnType<typeof usePromptRuns> | null = null;

/** 再マウント後の store を型を保ったまま取得する（未マウントなら失敗） */
const getStore = (): ReturnType<typeof usePromptRuns> => {
  if (!store) throw new Error("store is not mounted");
  return store;
};

const Harness: React.FC = () => {
  store = usePromptRuns();
  return null;
};

const mountProvider = () =>
  render(
    <PromptRunsProvider>
      <Harness />
    </PromptRunsProvider>,
  );

describe("PromptRuns persistence", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    handlers = new Set();
    store = null;

    mockApi.startPromptRun.mockResolvedValue("run-1");
    mockApi.onPromptRunEvent.mockImplementation(async (handler) => {
      handlers.add(handler);
      return () => {
        handlers.delete(handler);
      };
    });
  });

  it("実行履歴・会話・セッション紐付けが再マウント後も復元される", async () => {
    const first = mountProvider();

    // 送信 → 応答 → 完了 の一連を実行
    await act(async () => {
      await store?.sendPrompt("/Users/john/projects/alpha", {
        prompt: "永続化されるプロンプト",
        permissionMode: "plan",
        model: null,
      });
    });
    emit({
      run_id: "run-1",
      kind: "message",
      payload: {
        type: "assistant",
        session_id: "sess-persist-1234",
        message: {
          role: "assistant",
          content: [{ type: "text", text: "復元されるべき応答" }],
        },
      },
    });
    emit({ run_id: "run-1", kind: "exit", exit_code: 0, success: true });

    // アプリ再起動を模して Provider を破棄 → 新規マウント
    first.unmount();
    store = null;
    mountProvider();

    // 実行履歴が復元される
    const runs = getStore().runs;
    expect(runs).toHaveLength(1);
    expect(runs[0].prompt).toBe("永続化されるプロンプト");
    expect(runs[0].status).toBe("completed");

    // 会話ログとセッション紐付けが復元される
    const conversation = getStore().conversations.get(
      "/Users/john/projects/alpha",
    );
    expect(conversation?.sessionId).toBe("sess-persist-1234");
    expect(
      conversation?.entries.some(
        (e) => e.kind === "prompt" && e.text === "永続化されるプロンプト",
      ),
    ).toBe(true);

    // 復元されたセッションで続きから再開できる（--resume に載る）
    await act(async () => {
      await getStore().sendPrompt("/Users/john/projects/alpha", {
        prompt: "続きの指示",
        permissionMode: "plan",
        model: null,
      });
    });
    expect(mockApi.startPromptRun).toHaveBeenLastCalledWith(
      expect.objectContaining({ resumeSessionId: "sess-persist-1234" }),
    );
  });

  it("終了時に実行中だった run は「停止」として復元され中断が明示される", async () => {
    const first = mountProvider();

    await act(async () => {
      await store?.sendPrompt("/Users/john/projects/alpha", {
        prompt: "実行中のまま終了する",
        permissionMode: "plan",
        model: null,
      });
    });
    // exit イベントを流さないまま（実行中のまま）再起動
    first.unmount();
    store = null;
    mountProvider();

    const runs = getStore().runs;
    expect(runs).toHaveLength(1);
    expect(runs[0].status).toBe("stopped");

    const conversation = getStore().conversations.get(
      "/Users/john/projects/alpha",
    );
    expect(conversation?.isRunning).toBe(false);
    expect(
      conversation?.entries.some(
        (e) =>
          e.kind === "error" &&
          e.text.includes("アプリ終了により実行が中断されました"),
      ),
    ).toBe(true);
  });

  it("壊れた保存データは無視して空から始める", () => {
    localStorage.setItem("ccm-prompt-runs-v1", "{broken json!!");
    mountProvider();
    expect(getStore().runs).toHaveLength(0);
    expect(getStore().conversations.size).toBe(0);
  });
});
