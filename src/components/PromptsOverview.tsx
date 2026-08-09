/**
 * 全プロジェクトのプロンプト実行状況を一覧するビュー（ナビの Prompts タブ）。
 *
 * データは PromptRunsContext から取得する。ここからは各プロジェクトの
 * Prompt タブへジャンプでき、実行中のランはその場で停止できる。
 */
import React, { useCallback, useEffect, useMemo, useState } from "react";
import {
  RUN_STATUS_META,
  usePromptRuns,
  type PromptRunStatus,
} from "../contexts/PromptRunsContext";
import { PromptRunRow } from "./PromptRunRow";

interface PromptsOverviewProps {
  onOpenProject: (projectPath: string) => void;
}

type Filter = "all" | PromptRunStatus;

const FILTERS: { key: Filter; label: string }[] = [
  { key: "all", label: "すべて" },
  { key: "running", label: "実行中" },
  { key: "completed", label: "完了" },
  { key: "failed", label: "失敗" },
  { key: "stopped", label: "停止" },
];

export const PromptsOverview: React.FC<PromptsOverviewProps> = ({
  onOpenProject,
}) => {
  const { runs, runningCount, stopRun } = usePromptRuns();
  const [filter, setFilter] = useState<Filter>("all");
  const [now, setNow] = useState(() => Date.now());

  // 実行中の経過時間表示のため 1 秒ごとに now を更新する
  const hasRunning = runningCount > 0;
  useEffect(() => {
    if (!hasRunning) return;
    const timer = setInterval(() => setNow(Date.now()), 1000);
    return () => clearInterval(timer);
  }, [hasRunning]);

  const counts = useMemo(() => {
    const c: Record<Filter, number> = {
      all: runs.length,
      running: 0,
      completed: 0,
      failed: 0,
      stopped: 0,
    };
    for (const run of runs) c[run.status] += 1;
    return c;
  }, [runs]);

  const visibleRuns = useMemo(
    () => (filter === "all" ? runs : runs.filter((r) => r.status === filter)),
    [runs, filter],
  );

  const handleStop = useCallback(
    (runId: string) => {
      stopRun(runId).catch((error: unknown) => {
        console.error("Failed to stop prompt run:", error);
      });
    },
    [stopRun],
  );

  return (
    <div className="prompts-overview">
      <header className="prompts-overview__header">
        <h2 className="prompts-overview__title">Prompts</h2>
        <p className="prompts-overview__subtitle">
          全プロジェクトのプロンプト実行状況（アプリ起動中の履歴）
        </p>
      </header>

      <div
        className="prompts-overview__filters"
        role="group"
        aria-label="実行状態で絞り込み"
      >
        {FILTERS.map(({ key, label }) => (
          <button
            key={key}
            type="button"
            className={`prompts-overview__filter ${
              filter === key ? "prompts-overview__filter--active" : ""
            }`}
            aria-pressed={filter === key}
            onClick={() => setFilter(key)}
          >
            {key !== "all" && (
              <span aria-hidden="true">{RUN_STATUS_META[key].icon} </span>
            )}
            {label}
            <span className="prompts-overview__filter-count">
              {counts[key]}
            </span>
          </button>
        ))}
      </div>

      {visibleRuns.length === 0 ? (
        <div className="prompts-overview__empty">
          {runs.length === 0
            ? "まだプロンプトを実行していません。プロジェクトを開き、Prompt タブから Claude に指示を出せます。"
            : "この条件に一致する実行はありません。"}
        </div>
      ) : (
        <ul className="prompts-overview__list">
          {visibleRuns.map((run) => (
            <PromptRunRow
              key={run.runId}
              run={run}
              now={now}
              onOpen={() => onOpenProject(run.projectPath)}
              onStop={() => handleStop(run.runId)}
            />
          ))}
        </ul>
      )}
    </div>
  );
};
