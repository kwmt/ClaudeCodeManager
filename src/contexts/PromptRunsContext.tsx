/**
 * アプリ全体でプロンプト実行の状態を共有するストア。
 *
 * 2 種類の状態をプロジェクト横断で保持する:
 * 1. 実行サマリー（PromptRunInfo）— Prompts タブ / Dashboard の一覧用
 * 2. 会話ログ（PromptConversation）— 各プロジェクトの Prompt タブの表示内容
 *
 * `prompt-run-event` はこの Provider だけが購読し、run_id → プロジェクトの
 * 対応表（実行サマリー）を使って会話ログへ振り分ける。会話状態を
 * コンポーネントではなくここに置くことで、Dashboard へ移動して
 * ProjectScreen（と PromptRunner）がアンマウントされても、実行の追跡と
 * 会話ログの蓄積が途切れない。
 *
 * 履歴はメモリ上のみ（アプリを終了すると消える）。
 */
import React, {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useRef,
  useState,
} from "react";
import { api } from "../api";
import type {
  PermissionMode,
  PromptRunEvent,
  StreamContentBlock,
} from "../types";

export type PromptRunStatus = "running" | "completed" | "failed" | "stopped";

export interface PromptRunInfo {
  runId: string;
  projectPath: string;
  prompt: string;
  permissionMode: PermissionMode;
  model: string | null;
  status: PromptRunStatus;
  startedAt: number;
  finishedAt: number | null;
  sessionId: string | null;
  /** 最後に観測したアクティビティ（ツール実行や応答テキストの要約） */
  lastActivity: string | null;
  durationMs: number | null;
  numTurns: number | null;
  costUsd: number | null;
  exitCode: number | null;
}

export interface RegisterRunMeta {
  projectPath: string;
  prompt: string;
  permissionMode: PermissionMode;
  model: string | null;
}

/** 会話ログの 1 エントリ（Prompt タブに表示する単位） */
export type ConversationEntry =
  | { id: string; kind: "prompt"; text: string }
  | {
      id: string;
      kind: "block";
      role: "assistant" | "user";
      block: StreamContentBlock;
    }
  | {
      id: string;
      kind: "result";
      durationMs?: number;
      numTurns?: number;
      costUsd?: number;
      isError?: boolean;
    }
  | { id: string; kind: "error"; text: string }
  | { id: string; kind: "exit"; success: boolean; exitCode?: number };

/** プロジェクトごとの会話状態 */
export interface PromptConversation {
  entries: ConversationEntry[];
  stderrLines: string[];
  sessionId: string | null;
  isRunning: boolean;
  /** 実行中の run_id（送信〜run_id 確定までの間は null） */
  activeRunId: string | null;
}

export interface SendPromptParams {
  prompt: string;
  permissionMode: PermissionMode;
  model: string | null;
}

export const EMPTY_CONVERSATION: PromptConversation = {
  entries: [],
  stderrLines: [],
  sessionId: null,
  isRunning: false,
  activeRunId: null,
};

interface PromptRunsContextValue {
  /** すべての実行（開始が新しい順） */
  runs: PromptRunInfo[];
  runningCount: number;
  /** プロジェクトごとの最新の実行 */
  latestRunByProject: Map<string, PromptRunInfo>;
  /** プロジェクトごとの会話ログ */
  conversations: Map<string, PromptConversation>;
  registerRun: (runId: string, meta: RegisterRunMeta) => void;
  stopRun: (runId: string) => Promise<void>;
  /** プロンプトを送信する（会話へのエントリ追加〜実行登録まで担う） */
  sendPrompt: (projectPath: string, params: SendPromptParams) => Promise<void>;
  /** 会話ログをクリアして新しい会話を始める */
  resetConversation: (projectPath: string) => void;
}

const PromptRunsContext = createContext<PromptRunsContextValue | null>(null);

/** 保持する実行履歴の上限（超えた分は終了済みの古いものから捨てる） */
const MAX_FINISHED_RUNS = 50;
/** run_id 未登録のまま届いたイベントのバッファ上限 */
const PENDING_EVENT_LIMIT = 300;

/** SIGTERM（停止ボタン）による終了コード */
const SIGTERM_EXIT_CODE = 143;

function summarizeToolInput(input: Record<string, unknown>): string {
  const keys = ["file_path", "command", "pattern", "path", "prompt"] as const;
  for (const key of keys) {
    const value = input[key];
    if (typeof value === "string" && value.length > 0) {
      return value.length > 80 ? `${value.slice(0, 80)}…` : value;
    }
  }
  return "";
}

function truncate(text: string, max: number): string {
  return text.length > max ? `${text.slice(0, max)}…` : text;
}

/** イベントを 1 件適用した新しい PromptRunInfo を返す */
function applyEvent(info: PromptRunInfo, event: PromptRunEvent): PromptRunInfo {
  switch (event.kind) {
    case "message": {
      const payload = event.payload;
      if (!payload) return info;
      const next: PromptRunInfo = { ...info };
      if (payload.session_id) {
        next.sessionId = payload.session_id;
      }
      if (payload.type === "assistant") {
        const content = payload.message?.content;
        if (Array.isArray(content)) {
          for (const block of content) {
            if (block.type === "tool_use") {
              const summary = summarizeToolInput(block.input);
              next.lastActivity = summary
                ? `⚙ ${block.name} ${summary}`
                : `⚙ ${block.name}`;
            } else if (block.type === "text" && block.text.trim().length > 0) {
              next.lastActivity = truncate(block.text.trim(), 80);
            }
          }
        }
      } else if (payload.type === "result") {
        next.durationMs =
          typeof payload.duration_ms === "number" ? payload.duration_ms : null;
        next.numTurns =
          typeof payload.num_turns === "number" ? payload.num_turns : null;
        next.costUsd =
          typeof payload.total_cost_usd === "number"
            ? payload.total_cost_usd
            : null;
      }
      return next;
    }
    case "error":
      return { ...info, lastActivity: event.text ?? info.lastActivity };
    case "exit": {
      const exitCode = event.exit_code ?? null;
      const status: PromptRunStatus =
        event.success === true
          ? "completed"
          : exitCode === SIGTERM_EXIT_CODE
            ? "stopped"
            : "failed";
      return { ...info, status, exitCode, finishedAt: Date.now() };
    }
    default:
      return info;
  }
}

let conversationEntrySeq = 0;
const nextEntryId = (): string => {
  conversationEntrySeq += 1;
  return `prompt-entry-${conversationEntrySeq}`;
};

const toErrorMessage = (error: unknown): string => {
  if (error instanceof Error) return error.message;
  if (typeof error === "string") return error;
  return "不明なエラーが発生しました";
};

/**
 * イベントを 1 件適用した新しい会話状態を返す。
 * activeRunId と一致しないイベント（古い実行の残骸など）は無視する。
 */
function applyConversationEvent(
  conversation: PromptConversation,
  event: PromptRunEvent,
): PromptConversation {
  if (conversation.activeRunId !== event.run_id) return conversation;

  switch (event.kind) {
    case "message": {
      const payload = event.payload;
      if (!payload) return conversation;

      let next = conversation;
      if (payload.session_id && payload.session_id !== next.sessionId) {
        next = { ...next, sessionId: payload.session_id };
      }

      if (payload.type === "assistant" || payload.type === "user") {
        const role = payload.type;
        const content = payload.message?.content;
        const blocks: StreamContentBlock[] = Array.isArray(content)
          ? content
          : typeof content === "string" && content.length > 0
            ? [{ type: "text", text: content }]
            : [];

        // user メッセージはプロンプトのエコーになるため tool_result のみ表示
        const visible =
          role === "user"
            ? blocks.filter((block) => block.type === "tool_result")
            : blocks;
        if (visible.length === 0) return next;

        return {
          ...next,
          entries: [
            ...next.entries,
            ...visible.map<ConversationEntry>((block) => ({
              id: nextEntryId(),
              kind: "block",
              role,
              block,
            })),
          ],
        };
      }
      if (payload.type === "result") {
        return {
          ...next,
          entries: [
            ...next.entries,
            {
              id: nextEntryId(),
              kind: "result",
              durationMs: payload.duration_ms,
              numTurns: payload.num_turns,
              costUsd: payload.total_cost_usd,
              isError: payload.is_error,
            },
          ],
        };
      }
      return next;
    }
    case "stderr": {
      if (!event.text) return conversation;
      return {
        ...conversation,
        stderrLines: [...conversation.stderrLines, event.text],
      };
    }
    case "error":
      return {
        ...conversation,
        entries: [
          ...conversation.entries,
          {
            id: nextEntryId(),
            kind: "error",
            text: event.text ?? "不明なエラーが発生しました",
          },
        ],
      };
    case "exit":
      return {
        ...conversation,
        isRunning: false,
        activeRunId: null,
        entries: [
          ...conversation.entries,
          {
            id: nextEntryId(),
            kind: "exit",
            success: event.success === true,
            exitCode: event.exit_code ?? undefined,
          },
        ],
      };
    default:
      return conversation;
  }
}

export const PromptRunsProvider: React.FC<{ children: React.ReactNode }> = ({
  children,
}) => {
  // 実データは ref に持ち、version の更新で再レンダリングを起こす。
  // 高頻度イベントの setState 連打と StrictMode の updater 二重実行を避けるため。
  const runsRef = useRef<Map<string, PromptRunInfo>>(new Map());
  const conversationsRef = useRef<Map<string, PromptConversation>>(new Map());
  const [version, setVersion] = useState(0);
  const bump = useCallback(() => setVersion((v) => v + 1), []);

  // registerRun 前に届いたイベントの一時バッファ（run_id ごと・受信順）
  const pendingRef = useRef<Map<string, PromptRunEvent[]>>(new Map());
  const pendingCountRef = useRef(0);

  const trimFinished = useCallback(() => {
    const runs = runsRef.current;
    const finished = [...runs.values()]
      .filter((r) => r.status !== "running")
      .sort((a, b) => a.startedAt - b.startedAt);
    while (finished.length > MAX_FINISHED_RUNS) {
      const oldest = finished.shift();
      if (oldest) runs.delete(oldest.runId);
    }
  }, []);

  const handleEvent = useCallback(
    (event: PromptRunEvent) => {
      const runs = runsRef.current;
      const info = runs.get(event.run_id);
      if (!info) {
        // run_id が未登録（startPromptRun の resolve 前）の間はバッファする
        const pending = pendingRef.current;
        const queue = pending.get(event.run_id);
        if (queue) {
          queue.push(event);
        } else {
          pending.set(event.run_id, [event]);
        }
        pendingCountRef.current += 1;
        while (pendingCountRef.current > PENDING_EVENT_LIMIT) {
          const oldestKey: string | undefined = pending.keys().next().value;
          if (oldestKey === undefined) {
            pendingCountRef.current = 0;
            break;
          }
          const oldest = pending.get(oldestKey);
          if (!oldest || oldest.length === 0) {
            pending.delete(oldestKey);
            continue;
          }
          oldest.shift();
          pendingCountRef.current -= 1;
          if (oldest.length === 0) pending.delete(oldestKey);
        }
        return;
      }
      runs.set(event.run_id, applyEvent(info, event));
      // 実行サマリーの run_id → projectPath を使って会話ログへも振り分ける
      const conversation =
        conversationsRef.current.get(info.projectPath) ?? EMPTY_CONVERSATION;
      conversationsRef.current.set(
        info.projectPath,
        applyConversationEvent(conversation, event),
      );
      if (event.kind === "exit") trimFinished();
      bump();
    },
    [bump, trimFinished],
  );

  const registerRun = useCallback(
    (runId: string, meta: RegisterRunMeta) => {
      const runs = runsRef.current;
      runs.set(runId, {
        runId,
        projectPath: meta.projectPath,
        prompt: meta.prompt,
        permissionMode: meta.permissionMode,
        model: meta.model,
        status: "running",
        startedAt: Date.now(),
        finishedAt: null,
        sessionId: null,
        lastActivity: null,
        durationMs: null,
        numTurns: null,
        costUsd: null,
        exitCode: null,
      });
      // 会話を実行に紐付ける（送信済みプロンプト表示は sendPrompt が済ませている）
      const conversations = conversationsRef.current;
      const conversation =
        conversations.get(meta.projectPath) ?? EMPTY_CONVERSATION;
      conversations.set(meta.projectPath, {
        ...conversation,
        isRunning: true,
        activeRunId: runId,
      });

      // 登録前に届いていたイベントを受信順に適用する（サマリー・会話の両方）
      const buffered = pendingRef.current.get(runId);
      if (buffered) {
        pendingRef.current.delete(runId);
        pendingCountRef.current = Math.max(
          0,
          pendingCountRef.current - buffered.length,
        );
        for (const event of buffered) {
          const currentRun = runs.get(runId);
          if (currentRun) runs.set(runId, applyEvent(currentRun, event));
          const currentConversation =
            conversations.get(meta.projectPath) ?? EMPTY_CONVERSATION;
          conversations.set(
            meta.projectPath,
            applyConversationEvent(currentConversation, event),
          );
        }
        trimFinished();
      }
      bump();
    },
    [bump, trimFinished],
  );

  const stopRun = useCallback(async (runId: string) => {
    await api.stopPromptRun(runId);
  }, []);

  /**
   * プロンプト送信の一連の流れを担う:
   * ユーザー発言の追加 → CLI 起動 → 実行の登録（バッファ済みイベントの反映）。
   * 失敗時はエラー行を会話に追加して実行中フラグを下ろす。
   */
  const sendPrompt = useCallback(
    async (projectPath: string, params: SendPromptParams) => {
      const text = params.prompt.trim();
      if (!text) return;

      const conversations = conversationsRef.current;
      const before = conversations.get(projectPath) ?? EMPTY_CONVERSATION;
      const resumeSessionId = before.sessionId;
      conversations.set(projectPath, {
        ...before,
        entries: [
          ...before.entries,
          { id: nextEntryId(), kind: "prompt", text },
        ],
        stderrLines: [],
        isRunning: true,
        activeRunId: null,
      });
      bump();

      try {
        const runId = await api.startPromptRun({
          projectPath,
          prompt: text,
          permissionMode: params.permissionMode,
          resumeSessionId,
          model: params.model,
        });
        registerRun(runId, {
          projectPath,
          prompt: text,
          permissionMode: params.permissionMode,
          model: params.model,
        });
      } catch (error: unknown) {
        const current = conversations.get(projectPath) ?? EMPTY_CONVERSATION;
        conversations.set(projectPath, {
          ...current,
          isRunning: false,
          activeRunId: null,
          entries: [
            ...current.entries,
            {
              id: nextEntryId(),
              kind: "error",
              text: `実行を開始できませんでした: ${toErrorMessage(error)}`,
            },
          ],
        });
        bump();
      }
    },
    [bump, registerRun],
  );

  /**
   * 会話ログをクリアする。実行中の場合は実行自体は継続し、
   * 以降のイベントは（activeRunId を保持しているため）引き続き追記される。
   */
  const resetConversation = useCallback(
    (projectPath: string) => {
      const conversations = conversationsRef.current;
      const current = conversations.get(projectPath) ?? EMPTY_CONVERSATION;
      conversations.set(projectPath, {
        ...current,
        entries: [],
        stderrLines: [],
        sessionId: null,
      });
      bump();
    },
    [bump],
  );

  useEffect(() => {
    let disposed = false;
    let unlisten: (() => void) | undefined;

    api
      .onPromptRunEvent(handleEvent)
      .then((fn) => {
        if (disposed) {
          fn();
        } else {
          unlisten = fn;
        }
      })
      .catch((error: unknown) => {
        console.error("Failed to subscribe prompt-run-event:", error);
      });

    return () => {
      disposed = true;
      unlisten?.();
    };
  }, [handleEvent]);

  const value = useMemo<PromptRunsContextValue>(() => {
    void version; // version 更新で再計算させる
    const runs = [...runsRef.current.values()].sort(
      (a, b) => b.startedAt - a.startedAt,
    );
    const latestRunByProject = new Map<string, PromptRunInfo>();
    for (const run of runs) {
      if (!latestRunByProject.has(run.projectPath)) {
        latestRunByProject.set(run.projectPath, run);
      }
    }
    return {
      runs,
      runningCount: runs.filter((r) => r.status === "running").length,
      latestRunByProject,
      conversations: new Map(conversationsRef.current),
      registerRun,
      stopRun,
      sendPrompt,
      resetConversation,
    };
  }, [version, registerRun, stopRun, sendPrompt, resetConversation]);

  return (
    <PromptRunsContext.Provider value={value}>
      {children}
    </PromptRunsContext.Provider>
  );
};

/** Provider 配下でのみ使う（無ければ例外） */
export function usePromptRuns(): PromptRunsContextValue {
  const value = useContext(PromptRunsContext);
  if (!value) {
    throw new Error("usePromptRuns must be used within PromptRunsProvider");
  }
  return value;
}

/**
 * Provider が無くても動作させたいコンポーネント用（テスト単体レンダリング等）。
 * 無い場合は null を返し、呼び出し側は機能を無効化する。
 */
export function usePromptRunsOptional(): PromptRunsContextValue | null {
  return useContext(PromptRunsContext);
}

/** 実行中の経過時間などの表示用フォーマッタ */
export function formatElapsed(ms: number): string {
  const totalSeconds = Math.max(0, Math.floor(ms / 1000));
  const minutes = Math.floor(totalSeconds / 60);
  const seconds = totalSeconds % 60;
  if (minutes === 0) return `${seconds}s`;
  return `${minutes}m${String(seconds).padStart(2, "0")}s`;
}

export const RUN_STATUS_META: Record<
  PromptRunStatus,
  { icon: string; label: string }
> = {
  running: { icon: "⏳", label: "実行中" },
  completed: { icon: "✅", label: "完了" },
  failed: { icon: "❌", label: "失敗" },
  stopped: { icon: "⏹", label: "停止" },
};
