/**
 * アプリ全体でプロンプト実行の状態を共有するストア。
 *
 * PromptRunner（各プロジェクトの Prompt タブ）は会話の詳細表示を担い、
 * このストアは「どのプロジェクトで何が動いていて、どう終わったか」という
 * サマリーだけを保持する。`prompt-run-event` を独自に購読するため、
 * PromptRunner がアンマウントされても実行状況の追跡は継続する。
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
import type { PermissionMode, PromptRunEvent } from "../types";

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

interface PromptRunsContextValue {
  /** すべての実行（開始が新しい順） */
  runs: PromptRunInfo[];
  runningCount: number;
  /** プロジェクトごとの最新の実行 */
  latestRunByProject: Map<string, PromptRunInfo>;
  registerRun: (runId: string, meta: RegisterRunMeta) => void;
  stopRun: (runId: string) => Promise<void>;
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

export const PromptRunsProvider: React.FC<{ children: React.ReactNode }> = ({
  children,
}) => {
  // 実データは ref に持ち、version の更新で再レンダリングを起こす。
  // 高頻度イベントの setState 連打と StrictMode の updater 二重実行を避けるため。
  const runsRef = useRef<Map<string, PromptRunInfo>>(new Map());
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
      // 登録前に届いていたイベントを受信順に適用する
      const buffered = pendingRef.current.get(runId);
      if (buffered) {
        pendingRef.current.delete(runId);
        pendingCountRef.current = Math.max(
          0,
          pendingCountRef.current - buffered.length,
        );
        for (const event of buffered) {
          const current = runs.get(runId);
          if (current) runs.set(runId, applyEvent(current, event));
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
      registerRun,
      stopRun,
    };
  }, [version, registerRun, stopRun]);

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
