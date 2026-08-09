/**
 * プロンプト実行 1 件分の行表示。
 * Prompts タブ（PromptsOverview）と Dashboard の実行状況セクションで共用する。
 */
import React from "react";
import {
  formatElapsed,
  RUN_STATUS_META,
  type PromptRunInfo,
} from "../contexts/PromptRunsContext";
import { getProjectDisplayName } from "../utils/pathUtils";

interface PromptRunRowProps {
  run: PromptRunInfo;
  /** 実行中の経過時間計算に使う現在時刻（呼び出し側で 1 秒ごとに更新） */
  now: number;
  onOpen: () => void;
  onStop: () => void;
}

export const PromptRunRow = React.memo<PromptRunRowProps>(
  ({ run, now, onOpen, onStop }) => {
    const meta = RUN_STATUS_META[run.status];
    const elapsed =
      run.status === "running"
        ? formatElapsed(now - run.startedAt)
        : run.durationMs !== null
          ? formatElapsed(run.durationMs)
          : null;

    return (
      <li className={`prompt-runs-row prompt-runs-row--${run.status}`}>
        <span
          className={`prompt-runs-row__icon prompt-runs-row__icon--${run.status}`}
          role="img"
          aria-label={meta.label}
        >
          {meta.icon}
        </span>
        <div className="prompt-runs-row__body">
          <div className="prompt-runs-row__title">
            <span className="prompt-runs-row__project">
              {getProjectDisplayName(run.projectPath)}
            </span>
            <span className="prompt-runs-row__meta">
              {elapsed && <span>{elapsed}</span>}
              {run.numTurns !== null && <span>{run.numTurns} turns</span>}
              {run.costUsd !== null && <span>${run.costUsd.toFixed(4)}</span>}
              {run.status === "running" && <span>{run.permissionMode}</span>}
              {run.status === "failed" && run.exitCode !== null && (
                <span>終了コード {run.exitCode}</span>
              )}
            </span>
          </div>
          <div className="prompt-runs-row__prompt" title={run.prompt}>
            {run.prompt}
          </div>
          {run.status === "running" && run.lastActivity && (
            <div className="prompt-runs-row__activity">{run.lastActivity}</div>
          )}
        </div>
        <div className="prompt-runs-row__actions">
          {run.status === "running" && (
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
