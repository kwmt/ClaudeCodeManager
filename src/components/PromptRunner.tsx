/**
 * PromptRunner — アプリ内から `claude` CLI をヘッドレス起動し、
 * stream-json 出力をリアルタイム表示するコンポーネント。
 *
 * 会話ログ・実行状態は PromptRunsContext がプロジェクト単位で保持しており、
 * このコンポーネントはその表示と入力 UI だけを担う。そのため Dashboard 等へ
 * 移動してアンマウントされても会話は失われず、戻れば続きが表示される。
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
import {
  EMPTY_CONVERSATION,
  usePromptRuns,
  type ConversationEntry,
} from "../contexts/PromptRunsContext";
import type { ClaudeCliStatus, PermissionMode } from "../types";
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

const LogEntryRow = React.memo<{ entry: ConversationEntry }>(({ entry }) => {
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
  /** 継続中セッションを Sessions タブで開く（会話履歴の詳細を見る導線） */
  onOpenSession?: (sessionId: string) => void;
}

export const PromptRunner: React.FC<PromptRunnerProps> = ({
  projectPath,
  onRunFinished,
  onOpenSession,
}) => {
  const [cliStatus, setCliStatus] = useState<ClaudeCliStatus | null>(null);
  const [promptText, setPromptText] = useState("");
  const [permissionMode, setPermissionMode] = useState<PermissionMode>("plan");
  const [model, setModel] = useState("");
  const [confirmOpen, setConfirmOpen] = useState(false);
  const [stopError, setStopError] = useState<string | null>(null);

  // 会話ログ・実行状態はストアがプロジェクト単位で保持している
  const { conversations, sendPrompt, resetConversation, stopRun } =
    usePromptRuns();
  const conversation = conversations.get(projectPath) ?? EMPTY_CONVERSATION;
  const { entries, stderrLines, sessionId, isRunning, activeRunId } =
    conversation;

  const onRunFinishedRef = useRef(onRunFinished);
  const logRef = useRef<HTMLDivElement>(null);
  const stickToBottomRef = useRef(true);
  const textareaRef = useRef<HTMLTextAreaElement>(null);

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

  // --- 実行完了の検知（isRunning の true → false 遷移で通知） -------------
  const prevRunningRef = useRef(isRunning);
  useEffect(() => {
    if (prevRunningRef.current && !isRunning) {
      onRunFinishedRef.current?.();
    }
    prevRunningRef.current = isRunning;
  }, [isRunning]);

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

    setPromptText("");
    setStopError(null);
    stickToBottomRef.current = true;
    if (textareaRef.current) {
      textareaRef.current.style.height = "auto";
    }

    await sendPrompt(projectPath, {
      prompt: text,
      permissionMode,
      model: model === "" ? null : model,
    });
  }, [promptText, projectPath, permissionMode, model, sendPrompt]);

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
    if (!activeRunId) return;
    try {
      await stopRun(activeRunId);
    } catch (error: unknown) {
      setStopError(`停止に失敗しました: ${toErrorMessage(error)}`);
    }
  }, [activeRunId, stopRun]);

  const handleNewConversation = useCallback(() => {
    resetConversation(projectPath);
  }, [resetConversation, projectPath]);

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
        {stopError && (
          <div className="prompt-runner__error-row" role="alert">
            {stopError}
          </div>
        )}
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
            {onOpenSession && !isRunning && (
              <button
                type="button"
                className="prompt-runner__link-button"
                onClick={() => onOpenSession(sessionId)}
              >
                Sessions で開く
              </button>
            )}
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
