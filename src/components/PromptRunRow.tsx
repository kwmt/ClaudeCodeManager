/**
 * プロンプト実行 1 件分の行表示。
 * Prompts タブ（PromptsOverview）と Dashboard の実行状況セクションで共用する。
 *
 * レイアウトは可読性の研究に基づく:
 * - F 字型走査に合わせ、左端に固定幅の状態ピル（色＋ラベル）を縦に揃える
 * - 主役はプロンプト本文（太字・最大 60ch で省略）。メタ情報は 2 行目に淡色で降格
 * - 右端に相対時刻（「3分前」）。正確な時刻は title で補う
 * - 権限モードは既定（plan）では表示せず、bypassPermissions のときだけ警告する
 */
import React from "react";
import {
  formatElapsed,
  formatRelativeTime,
  RUN_STATUS_META,
  type PromptRunInfo,
} from "../contexts/PromptRunsContext";
import { getProjectDisplayName } from "../utils/pathUtils";

interface PromptRunRowProps {
  run: PromptRunInfo;
  /** 実行中の経過時間・相対時刻の計算に使う現在時刻（呼び出し側で 1 秒ごとに更新） */
  now: number;
  onOpen: () => void;
  onStop: () => void;
}

export const PromptRunRow = React.memo<PromptRunRowProps>(
  ({ run, now, onOpen, onStop }) => {
    const meta = RUN_STATUS_META[run.status];
    const isRunning = run.status === "running";

    // 「いつ」: 実行中は経過時間、終了後は終了時点からの相対時刻
    const whenTimestamp = run.finishedAt ?? run.startedAt;
    const when = isRunning
      ? `${formatElapsed(now - run.startedAt)} 経過`
      : formatRelativeTime(whenTimestamp, now);
    const whenTitle = new Date(whenTimestamp).toLocaleString();

    return (
      <li className={`prompt-runs-row prompt-runs-row--${run.status}`}>
        <span
          className={`run-status-pill run-status-pill--${run.status}`}
          aria-label={meta.label}
        >
          <span className="run-status-pill__dot" aria-hidden="true" />
          {meta.label}
        </span>
        <div className="prompt-runs-row__body">
          <div className="prompt-runs-row__primary">
            <span className="prompt-runs-row__prompt" title={run.prompt}>
              {run.prompt}
            </span>
            <time className="prompt-runs-row__when" title={whenTitle}>
              {when}
            </time>
          </div>
          <div className="prompt-runs-row__secondary">
            <span className="prompt-runs-row__project">
              {getProjectDisplayName(run.projectPath)}
            </span>
            {!isRunning && run.durationMs !== null && (
              <span>{formatElapsed(run.durationMs)}</span>
            )}
            {run.numTurns !== null && <span>{run.numTurns} turns</span>}
            {run.costUsd !== null && <span>${run.costUsd.toFixed(2)}</span>}
            {run.status === "failed" && run.exitCode !== null && (
              <span>終了コード {run.exitCode}</span>
            )}
            {run.permissionMode === "bypassPermissions" && (
              <span className="prompt-runs-row__danger-mode">全許可</span>
            )}
          </div>
          {isRunning && run.lastActivity && (
            <div className="prompt-runs-row__activity">{run.lastActivity}</div>
          )}
        </div>
        <div className="prompt-runs-row__actions">
          {isRunning && (
            <button
              type="button"
              className="prompt-runs-row__button"
              onClick={onStop}
            >
              停止
            </button>
          )}
          <button
            type="button"
            className="prompt-runs-row__button prompt-runs-row__button--primary"
            onClick={onOpen}
          >
            開く
          </button>
        </div>
      </li>
    );
  },
);
PromptRunRow.displayName = "PromptRunRow";
