/**
 * PromptRunner — アプリ内から `claude` CLI をヘッドレス起動し、
 * stream-json 出力をリアルタイム表示するコンポーネント。
 *
 * SECURITY: assistant の markdown は marked でレンダリングした後、
 * 必ず DOMPurify.sanitize() を通してから dangerouslySetInnerHTML に渡す。
 * CLI 出力は外部由来の信頼できない入力とみなす。
 */

import DOMPurify from "isomorphic-dompurify";
import { marked } from "marked";
import React, {
  useCallback,
  useEffect,
  useMemo,
  useRef,
  useState,
} from "react";
import { api } from "../api";
import type {
  ClaudeCliStatus,
  PermissionMode,
  PromptRunEvent,
  StreamContentBlock,
} from "../types";
import { SafeConfirmDialog } from "./SafeConfirmDialog";

// ============================================================================
// 定数
// ============================================================================

/** ツール入力の要約に使うキー（先に見つかったものを採用） */
const TOOL_SUMMARY_KEYS = [
  "file_path",
  "command",
  "pattern",
  "path",
  "prompt",
] as const;

/** 要約の最大文字数 */
const SUMMARY_MAX_LENGTH = 120;

/** tool_result 展開時に表示する最大文字数 */
const TOOL_RESULT_MAX_LENGTH = 4000;

/** 自動スクロールを追従させる下端からの距離(px) */
const STICK_TO_BOTTOM_THRESHOLD = 80;

/**
 * run_id 確定前に届いたイベントを溜めるバッファの上限。
 * 超えた分は古いものから捨てる（メモリリーク防止）。
 */
const BUFFERED_EVENT_LIMIT = 500;

const PERMISSION_MODE_OPTIONS: ReadonlyArray<{
  value: PermissionMode;
  label: string;
}> = [
  { value: "plan", label: "読み取り専用" },
  { value: "acceptEdits", label: "編集を自動承認" },
  { value: "bypassPermissions", label: "全許可（危険）" },
];

const MODEL_OPTIONS: ReadonlyArray<{ value: string; label: string }> = [
  { value: "", label: "既定" },
  { value: "opus", label: "opus" },
  { value: "sonnet", label: "sonnet" },
  { value: "haiku", label: "haiku" },
];

// ============================================================================
// 会話ログのエントリ型
// ============================================================================

type LogEntry =
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

let entrySeq = 0;
const nextEntryId = (): string => {
  entrySeq += 1;
  return `prompt-entry-${entrySeq}`;
};

// ============================================================================
// ユーティリティ（副作用なしの純粋関数：テストしやすさのため外出し）
// ============================================================================

const truncate = (value: string, max: number): string =>
  value.length > max ? `${value.slice(0, max)}…` : value;

const toErrorMessage = (error: unknown): string => {
  if (error instanceof Error) return error.message;
  if (typeof error === "string") return error;
  return "不明なエラーが発生しました";
};

/** marked の出力を必ずサニタイズしてから返す */
const renderMarkdown = (text: string): string => {
  try {
    const html = marked.parse(text, { async: false });
    return DOMPurify.sanitize(typeof html === "string" ? html : text);
  } catch {
    return DOMPurify.sanitize(text);
  }
};

/** tool_use の入力を 1 行に要約する */
export const summarizeToolInput = (input: Record<string, unknown>): string => {
  for (const key of TOOL_SUMMARY_KEYS) {
    const value = input[key];
    if (value === undefined || value === null) continue;
    const text = typeof value === "string" ? value : JSON.stringify(value);
    if (text && text.length > 0) return truncate(text, SUMMARY_MAX_LENGTH);
  }
  try {
    return truncate(JSON.stringify(input) ?? "", SUMMARY_MAX_LENGTH);
  } catch {
    return "";
  }
};

/** tool_result の content を表示可能な文字列にする */
const stringifyToolResult = (content: unknown): string => {
  if (content === undefined || content === null) return "";
  if (typeof content === "string") return content;
  try {
    return JSON.stringify(content, null, 2);
  } catch {
    return String(content);
  }
};

// ============================================================================
// 表示用サブコンポーネント（高頻度イベントに備えて memo 化）
// ============================================================================

const MarkdownText = React.memo<{ text: string }>(({ text }) => {
  const html = useMemo(() => renderMarkdown(text), [text]);
  return (
    <div
      className="prompt-runner__markdown"
      // biome-ignore lint/security/noDangerouslySetInnerHtml: DOMPurify でサニタイズ済み
      dangerouslySetInnerHTML={{ __html: html }}
    />
  );
});
MarkdownText.displayName = "MarkdownText";

const ThinkingBlock = React.memo<{ text: string }>(({ text }) => {
  const [expanded, setExpanded] = useState(false);
  return (
    <div className="prompt-runner__thinking">
      <button
        type="button"
        className="prompt-runner__disclosure"
        aria-expanded={expanded}
        onClick={() => setExpanded((prev) => !prev)}
      >
        <span aria-hidden="true">{expanded ? "▾" : "▸"}</span> 思考プロセス
      </button>
      {expanded && <pre className="prompt-runner__pre">{text}</pre>}
    </div>
  );
});
ThinkingBlock.displayName = "ThinkingBlock";

const ToolUseBlock = React.memo<{
  name: string;
  input: Record<string, unknown>;
}>(({ name, input }) => {
  const [expanded, setExpanded] = useState(false);
  const summary = useMemo(() => summarizeToolInput(input), [input]);
  const raw = useMemo(() => {
    try {
      return JSON.stringify(input, null, 2);
    } catch {
      return "";
    }
  }, [input]);

  return (
    <div className="prompt-runner__tool-use">
      <button
        type="button"
        className="prompt-runner__disclosure prompt-runner__disclosure--tool"
        aria-expanded={expanded}
        onClick={() => setExpanded((prev) => !prev)}
      >
        <span className="prompt-runner__tool-name">⚙ {name}</span>
        <span className="prompt-runner__tool-summary">{summary}</span>
      </button>
      {expanded && <pre className="prompt-runner__pre">{raw}</pre>}
    </div>
  );
});
ToolUseBlock.displayName = "ToolUseBlock";

const ToolResultBlock = React.memo<{
  content: unknown;
  isError: boolean;
}>(({ content, isError }) => {
  const [expanded, setExpanded] = useState(false);
  const text = useMemo(() => stringifyToolResult(content), [content]);
  const shown = useMemo(() => text.slice(0, TOOL_RESULT_MAX_LENGTH), [text]);
  const truncated = text.length > TOOL_RESULT_MAX_LENGTH;

  return (
    <div
      className={`prompt-runner__tool-result${
        isError ? " prompt-runner__tool-result--error" : ""
      }`}
    >
      <button
        type="button"
        className="prompt-runner__disclosure"
        aria-expanded={expanded}
        onClick={() => setExpanded((prev) => !prev)}
      >
        <span aria-hidden="true">{expanded ? "▾" : "▸"}</span>{" "}
        {isError ? "ツール結果（エラー）" : "ツール結果"}
      </button>
      {expanded && (
        <>
          <pre className="prompt-runner__pre">{shown}</pre>
          {truncated && (
            <p className="prompt-runner__truncated-note">
              （長いため先頭 {TOOL_RESULT_MAX_LENGTH} 文字のみ表示）
            </p>
          )}
        </>
      )}
    </div>
  );
});
ToolResultBlock.displayName = "ToolResultBlock";

const ResultSummary = React.memo<{
  durationMs?: number;
  numTurns?: number;
  costUsd?: number;
  isError?: boolean;
}>(({ durationMs, numTurns, costUsd, isError }) => {
  const chips = useMemo(() => {
    const items: string[] = [];
    if (typeof durationMs === "number") {
      items.push(`所要 ${(durationMs / 1000).toFixed(1)}s`);
    }
    if (typeof numTurns === "number") {
      items.push(`${numTurns} turns`);
    }
    if (typeof costUsd === "number") {
      items.push(`$${costUsd.toFixed(4)}`);
    }
    return items;
  }, [durationMs, numTurns, costUsd]);

  if (chips.length === 0) return null;

  return (
    <div
      className={`prompt-runner__result${
        isError ? " prompt-runner__result--error" : ""
      }`}
    >
      {chips.map((chip) => (
        <span key={chip} className="prompt-runner__chip">
          {chip}
        </span>
      ))}
    </div>
  );
});
ResultSummary.displayName = "ResultSummary";

const LogEntryRow = React.memo<{ entry: LogEntry }>(({ entry }) => {
  switch (entry.kind) {
    case "prompt":
      return (
        <div className="prompt-runner__bubble prompt-runner__bubble--user">
          {entry.text}
        </div>
      );
    case "block": {
      const { block } = entry;
      switch (block.type) {
        case "text":
          return <MarkdownText text={block.text} />;
        case "thinking":
          return <ThinkingBlock text={block.thinking ?? ""} />;
        case "tool_use":
          return <ToolUseBlock name={block.name} input={block.input} />;
        case "tool_result":
          return (
            <ToolResultBlock
              content={block.content}
              isError={block.is_error === true}
            />
          );
        default:
          return null;
      }
    }
    case "result":
      return (
        <ResultSummary
          durationMs={entry.durationMs}
          numTurns={entry.numTurns}
          costUsd={entry.costUsd}
          isError={entry.isError}
        />
      );
    case "error":
      return (
        <div className="prompt-runner__error-row" role="alert">
          {entry.text}
        </div>
      );
    case "exit":
      return entry.success ? (
        <div className="prompt-runner__exit">完了</div>
      ) : (
        <div className="prompt-runner__exit prompt-runner__exit--error">
          異常終了
          {typeof entry.exitCode === "number"
            ? `（終了コード ${entry.exitCode}）`
            : ""}
        </div>
      );
    default:
      return null;
  }
});
LogEntryRow.displayName = "LogEntryRow";

const StderrSection = React.memo<{ lines: string[] }>(({ lines }) => {
  const [expanded, setExpanded] = useState(false);
  if (lines.length === 0) return null;

  return (
    <div className="prompt-runner__stderr">
      <button
        type="button"
        className="prompt-runner__disclosure"
        aria-expanded={expanded}
        onClick={() => setExpanded((prev) => !prev)}
      >
        <span aria-hidden="true">{expanded ? "▾" : "▸"}</span> stderr
        <span className="prompt-runner__badge">{lines.length}</span>
      </button>
      {expanded && <pre className="prompt-runner__pre">{lines.join("\n")}</pre>}
    </div>
  );
});
StderrSection.displayName = "StderrSection";

// ============================================================================
// メインコンポーネント
// ============================================================================

interface PromptRunnerProps {
  projectPath: string;
  onRunFinished?: () => void;
}

export const PromptRunner: React.FC<PromptRunnerProps> = ({
  projectPath,
  onRunFinished,
}) => {
  const [cliStatus, setCliStatus] = useState<ClaudeCliStatus | null>(null);
  const [entries, setEntries] = useState<LogEntry[]>([]);
  const [stderrLines, setStderrLines] = useState<string[]>([]);
  const [isRunning, setIsRunning] = useState(false);
  const [promptText, setPromptText] = useState("");
  const [permissionMode, setPermissionMode] = useState<PermissionMode>("plan");
  const [model, setModel] = useState("");
  const [sessionId, setSessionId] = useState<string | null>(null);
  const [confirmOpen, setConfirmOpen] = useState(false);

  // イベントハンドラを張り替えないための ref 群
  const runIdRef = useRef<string | null>(null);
  const sessionIdRef = useRef<string | null>(null);
  const onRunFinishedRef = useRef(onRunFinished);
  const logRef = useRef<HTMLDivElement>(null);
  const stickToBottomRef = useRef(true);
  const textareaRef = useRef<HTMLTextAreaElement>(null);

  /**
   * 送信してから startPromptRun が resolve するまでの間は run_id が未確定。
   * その間に届いたイベントは捨てずにバッファへ積む。
   */
  const pendingRef = useRef(false);
  const eventBufferRef = useRef<Map<string, PromptRunEvent[]>>(new Map());
  const bufferedCountRef = useRef(0);

  useEffect(() => {
    onRunFinishedRef.current = onRunFinished;
  }, [onRunFinished]);

  // --- CLI ステータス取得 -----------------------------------------------
  useEffect(() => {
    let alive = true;
    api
      .getClaudeCliStatus()
      .then((status) => {
        if (alive) setCliStatus(status);
      })
      .catch((error: unknown) => {
        if (alive) {
          setCliStatus({ available: false, error: toErrorMessage(error) });
        }
      });
    return () => {
      alive = false;
    };
  }, []);

  // --- イベント処理（run_id の照合は呼び出し側の責務） --------------------
  const applyEvent = useCallback((event: PromptRunEvent) => {
    switch (event.kind) {
      case "message": {
        const payload = event.payload;
        if (!payload) return;

        if (payload.session_id) {
          sessionIdRef.current = payload.session_id;
          setSessionId(payload.session_id);
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
          if (visible.length === 0) return;

          setEntries((prev) => [
            ...prev,
            ...visible.map<LogEntry>((block) => ({
              id: nextEntryId(),
              kind: "block",
              role,
              block,
            })),
          ]);
        } else if (payload.type === "result") {
          setEntries((prev) => [
            ...prev,
            {
              id: nextEntryId(),
              kind: "result",
              durationMs: payload.duration_ms,
              numTurns: payload.num_turns,
              costUsd: payload.total_cost_usd,
              isError: payload.is_error,
            },
          ]);
        }
        return;
      }
      case "stderr": {
        const text = event.text;
        if (!text) return;
        setStderrLines((prev) => [...prev, text]);
        return;
      }
      case "error": {
        setEntries((prev) => [
          ...prev,
          {
            id: nextEntryId(),
            kind: "error",
            text: event.text ?? "不明なエラーが発生しました",
          },
        ]);
        return;
      }
      case "exit": {
        runIdRef.current = null;
        setIsRunning(false);
        setEntries((prev) => [
          ...prev,
          {
            id: nextEntryId(),
            kind: "exit",
            success: event.success === true,
            exitCode: event.exit_code ?? undefined,
          },
        ]);
        onRunFinishedRef.current?.();
        return;
      }
      default:
        return;
    }
  }, []);

  // --- run_id 未確定中のイベントバッファ ---------------------------------

  const clearEventBuffer = useCallback(() => {
    eventBufferRef.current.clear();
    bufferedCountRef.current = 0;
  }, []);

  /** pending 中に届いたイベントを run_id ごとに受信順で積む */
  const bufferEvent = useCallback((event: PromptRunEvent) => {
    const buffer = eventBufferRef.current;
    const queued = buffer.get(event.run_id);
    if (queued) {
      queued.push(event);
    } else {
      buffer.set(event.run_id, [event]);
    }
    bufferedCountRef.current += 1;

    // 上限超過分は古いものから捨てる（Map は挿入順を保つ）
    while (bufferedCountRef.current > BUFFERED_EVENT_LIMIT) {
      const oldestRunId: string | undefined = buffer.keys().next().value;
      if (oldestRunId === undefined) {
        bufferedCountRef.current = 0;
        break;
      }
      const oldest = buffer.get(oldestRunId);
      if (!oldest || oldest.length === 0) {
        buffer.delete(oldestRunId);
        continue;
      }
      oldest.shift();
      bufferedCountRef.current -= 1;
      if (oldest.length === 0) {
        buffer.delete(oldestRunId);
      }
    }
  }, []);

  /**
   * run_id 確定直後に呼ぶ。該当 run_id のバッファを受信順どおりに流し、
   * バッファ全体をクリアする（二重処理・リークの防止）。
   */
  const flushEventBuffer = useCallback(
    (runId: string) => {
      const buffered = eventBufferRef.current.get(runId) ?? [];
      clearEventBuffer();
      for (const event of buffered) {
        applyEvent(event);
      }
    },
    [applyEvent, clearEventBuffer],
  );

  // --- イベント購読（マウント時に一度だけ） ------------------------------
  const handleEvent = useCallback(
    (event: PromptRunEvent) => {
      const currentRunId = runIdRef.current;
      if (currentRunId !== null) {
        // run_id 確定済み: 一致するものだけ処理する
        if (event.run_id === currentRunId) {
          applyEvent(event);
        }
        return;
      }
      // run_id 未確定かつ実行開始待ち: 捨てずにバッファへ
      if (pendingRef.current) {
        bufferEvent(event);
      }
      // どちらでもなければ無視
    },
    [applyEvent, bufferEvent],
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

  // --- 自動スクロール（最下部付近にいるときだけ追従） --------------------
  const handleLogScroll = useCallback(() => {
    const el = logRef.current;
    if (!el) return;
    const distance = el.scrollHeight - el.scrollTop - el.clientHeight;
    stickToBottomRef.current = distance <= STICK_TO_BOTTOM_THRESHOLD;
  }, []);

  useEffect(() => {
    const el = logRef.current;
    if (!el || !stickToBottomRef.current) return;
    el.scrollTop = el.scrollHeight;
  }, [entries, stderrLines, isRunning]);

  // --- 実行 --------------------------------------------------------------
  const cliAvailable = cliStatus?.available === true;
  const canSend = cliAvailable && !isRunning && promptText.trim().length > 0;

  const runPrompt = useCallback(async () => {
    const text = promptText.trim();
    if (!text) return;

    setEntries((prev) => [
      ...prev,
      { id: nextEntryId(), kind: "prompt", text },
    ]);
    setPromptText("");
    setStderrLines([]);
    setIsRunning(true);
    stickToBottomRef.current = true;

    // run_id が返るまでのイベントを取りこぼさないよう pending に入る
    runIdRef.current = null;
    clearEventBuffer();
    pendingRef.current = true;

    if (textareaRef.current) {
      textareaRef.current.style.height = "auto";
    }

    try {
      const runId = await api.startPromptRun({
        projectPath,
        prompt: text,
        permissionMode,
        resumeSessionId: sessionIdRef.current,
        model: model === "" ? null : model,
      });
      // runIdRef の設定とフラッシュの間に await を挟まないこと（順序保証）
      runIdRef.current = runId;
      pendingRef.current = false;
      flushEventBuffer(runId);
    } catch (error: unknown) {
      runIdRef.current = null;
      pendingRef.current = false;
      clearEventBuffer();
      setIsRunning(false);
      setEntries((prev) => [
        ...prev,
        {
          id: nextEntryId(),
          kind: "error",
          text: `実行を開始できませんでした: ${toErrorMessage(error)}`,
        },
      ]);
    }
  }, [
    promptText,
    projectPath,
    permissionMode,
    model,
    clearEventBuffer,
    flushEventBuffer,
  ]);

  const handleSubmit = useCallback(() => {
    if (!canSend) return;
    if (permissionMode === "bypassPermissions") {
      setConfirmOpen(true);
      return;
    }
    void runPrompt();
  }, [canSend, permissionMode, runPrompt]);

  const handleConfirm = useCallback(() => {
    setConfirmOpen(false);
    void runPrompt();
  }, [runPrompt]);

  const handleCancelConfirm = useCallback(() => {
    setConfirmOpen(false);
  }, []);

  const handleStop = useCallback(async () => {
    const runId = runIdRef.current;
    if (!runId) return;
    try {
      await api.stopPromptRun(runId);
    } catch (error: unknown) {
      setEntries((prev) => [
        ...prev,
        {
          id: nextEntryId(),
          kind: "error",
          text: `停止に失敗しました: ${toErrorMessage(error)}`,
        },
      ]);
    }
  }, []);

  const handleNewConversation = useCallback(() => {
    sessionIdRef.current = null;
    setSessionId(null);
    setEntries([]);
    setStderrLines([]);
    clearEventBuffer();
  }, [clearEventBuffer]);

  const handlePromptChange = useCallback(
    (event: React.ChangeEvent<HTMLTextAreaElement>) => {
      setPromptText(event.target.value);
      const el = event.target;
      el.style.height = "auto";
      el.style.height = `${Math.min(el.scrollHeight, 192)}px`;
    },
    [],
  );

  const handleKeyDown = useCallback(
    (event: React.KeyboardEvent<HTMLTextAreaElement>) => {
      if ((event.metaKey || event.ctrlKey) && event.key === "Enter") {
        event.preventDefault();
        handleSubmit();
      }
    },
    [handleSubmit],
  );

  const handlePermissionModeChange = useCallback(
    (event: React.ChangeEvent<HTMLSelectElement>) => {
      setPermissionMode(event.target.value as PermissionMode);
    },
    [],
  );

  const handleModelChange = useCallback(
    (event: React.ChangeEvent<HTMLSelectElement>) => {
      setModel(event.target.value);
    },
    [],
  );

  return (
    <div className="prompt-runner">
      {/* CLI ステータス */}
      {cliStatus && !cliStatus.available && (
        <div className="prompt-runner__banner" role="alert">
          <span className="prompt-runner__banner-icon" aria-hidden="true">
            ⚠️
          </span>
          <span>
            {cliStatus.error ?? "claude CLI が見つかりませんでした。"}
          </span>
        </div>
      )}
      {cliAvailable && (
        <div className="prompt-runner__cli-status">
          claude {cliStatus?.version ?? ""}
        </div>
      )}

      {/* 会話エリア */}
      <div
        className="prompt-runner__log"
        ref={logRef}
        onScroll={handleLogScroll}
        role="log"
        aria-live="polite"
        aria-label="Claude との会話"
      >
        {entries.length === 0 && !isRunning && (
          <p className="prompt-runner__placeholder">
            まだ実行していません。下の入力欄から Claude に指示を出してください。
          </p>
        )}
        {entries.map((entry) => (
          <LogEntryRow key={entry.id} entry={entry} />
        ))}
        <StderrSection lines={stderrLines} />
        {isRunning && (
          <div className="prompt-runner__running">
            <span className="prompt-runner__spinner" aria-hidden="true" />
            <span>実行中…</span>
          </div>
        )}
      </div>

      {/* コンポーザー */}
      <div className="prompt-runner__composer">
        {sessionId && (
          <div className="prompt-runner__session">
            <span className="prompt-runner__session-label">
              セッション継続中: {sessionId.substring(0, 8)}
            </span>
            <button
              type="button"
              className="prompt-runner__link-button"
              onClick={handleNewConversation}
            >
              新しい会話
            </button>
          </div>
        )}

        <label className="sr-only" htmlFor="prompt-runner-input">
          Claude への指示
        </label>
        <textarea
          id="prompt-runner-input"
          ref={textareaRef}
          className="prompt-runner__textarea"
          value={promptText}
          onChange={handlePromptChange}
          onKeyDown={handleKeyDown}
          placeholder="Claude への指示を入力…（Cmd/Ctrl + Enter で送信）"
          rows={3}
        />

        <div className="prompt-runner__controls">
          <div className="prompt-runner__field">
            <label htmlFor="prompt-runner-permission">権限モード</label>
            <select
              id="prompt-runner-permission"
              value={permissionMode}
              onChange={handlePermissionModeChange}
              disabled={isRunning}
            >
              {PERMISSION_MODE_OPTIONS.map((option) => (
                <option key={option.value} value={option.value}>
                  {option.label}
                </option>
              ))}
            </select>
          </div>

          <div className="prompt-runner__field">
            <label htmlFor="prompt-runner-model">モデル</label>
            <select
              id="prompt-runner-model"
              value={model}
              onChange={handleModelChange}
              disabled={isRunning}
            >
              {MODEL_OPTIONS.map((option) => (
                <option key={option.value || "default"} value={option.value}>
                  {option.label}
                </option>
              ))}
            </select>
          </div>

          <div className="prompt-runner__actions">
            {isRunning && (
              <button
                type="button"
                className="prompt-runner__button prompt-runner__button--secondary"
                onClick={() => {
                  void handleStop();
                }}
              >
                停止
              </button>
            )}
            <button
              type="button"
              className="prompt-runner__button prompt-runner__button--primary"
              onClick={handleSubmit}
              disabled={!canSend}
            >
              送信
            </button>
          </div>
        </div>
      </div>

      <SafeConfirmDialog
        isOpen={confirmOpen}
        title="全許可モードで実行しますか？"
        message="「全許可（危険）」は Claude のすべてのツール実行を確認なしで許可します。ファイルの変更やコマンド実行が無条件に行われます。本当に実行しますか？"
        confirmText="実行する"
        cancelText="キャンセル"
        variant="danger"
        onConfirm={handleConfirm}
        onCancel={handleCancelConfirm}
      />
    </div>
  );
};
