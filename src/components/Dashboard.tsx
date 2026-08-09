import React, { useEffect, useMemo, useState, useCallback } from "react";
import { api } from "../api";
import {
  RUN_STATUS_META,
  usePromptRunsOptional,
  type PromptRunInfo,
  type PromptRunStatus,
} from "../contexts/PromptRunsContext";
import { formatDateForContext } from "../utils/dateUtils";
import { getProjectDisplayName } from "../utils/pathUtils";
import { PromptRunRow } from "./PromptRunRow";
import { SafeConfirmDialog } from "./SafeConfirmDialog";
import type {
  ClaudeSession,
  PermissionMode,
  SessionStats,
  ProjectSummary,
} from "../types";

interface DashboardProps {
  onProjectClick?: (projectPath: string) => void;
  /** 実行中プロンプトの行やバッジから Prompt タブ直行で開く */
  onOpenPromptRun?: (projectPath: string) => void;
  /** 「すべて見る」から Prompts タブへ移動する */
  onOpenPromptsTab?: () => void;
}

/** Recent Projects を折りたたみ表示するときの件数 */
const COLLAPSED_PROJECT_COUNT = 6;

/** Dashboard の実行状況セクションに表示する最大件数 */
const STATUS_BOARD_MAX_ROWS = 6;

/**
 * Dashboard 上部の「プロンプト実行状況」セクション。
 * 実行中だけでなく完了・失敗・停止も含めた直近の実行を一覧し、
 * プロジェクト横断の状況をダッシュボードだけで把握できるようにする。
 */
const PromptStatusSection: React.FC<{
  runs: PromptRunInfo[];
  onOpen?: (projectPath: string) => void;
  onStop: (runId: string) => void;
  onOpenAll?: () => void;
}> = ({ runs, onOpen, onStop, onOpenAll }) => {
  const [now, setNow] = useState(() => Date.now());

  const hasRunning = runs.some((run) => run.status === "running");
  useEffect(() => {
    if (!hasRunning) return;
    const timer = setInterval(() => setNow(Date.now()), 1000);
    return () => clearInterval(timer);
  }, [hasRunning]);

  const counts = useMemo(() => {
    const c: Record<PromptRunStatus, number> = {
      running: 0,
      completed: 0,
      failed: 0,
      stopped: 0,
    };
    for (const run of runs) c[run.status] += 1;
    return c;
  }, [runs]);

  // 実行中を先頭に、あとは新しい順
  const sorted = useMemo(
    () =>
      [...runs].sort(
        (a, b) =>
          (a.status === "running" ? 0 : 1) - (b.status === "running" ? 0 : 1) ||
          b.startedAt - a.startedAt,
      ),
    [runs],
  );
  const visible = sorted.slice(0, STATUS_BOARD_MAX_ROWS);
  const hiddenCount = sorted.length - visible.length;

  if (runs.length === 0) return null;

  return (
    <section
      className="dashboard-prompt-status"
      aria-labelledby="prompt-status-heading"
    >
      <div className="dashboard-prompt-status__header">
        <h2 id="prompt-status-heading" className="section-title">
          プロンプト実行状況
        </h2>
        <div className="dashboard-prompt-status__counts">
          {(Object.keys(counts) as PromptRunStatus[]).map(
            (status) =>
              counts[status] > 0 && (
                <span
                  key={status}
                  className={`dashboard-prompt-status__count dashboard-prompt-status__count--${status}`}
                >
                  <span
                    className={`run-status-dot run-status-dot--${status}`}
                    aria-hidden="true"
                  />
                  {RUN_STATUS_META[status].label} {counts[status]}
                </span>
              ),
          )}
        </div>
        {onOpenAll && (
          <button
            type="button"
            className="dashboard-prompt-status__all"
            onClick={onOpenAll}
          >
            すべて見る →
          </button>
        )}
      </div>
      <ul className="dashboard-prompt-status__list">
        {visible.map((run) => (
          <PromptRunRow
            key={run.runId}
            run={run}
            now={now}
            onOpen={() => onOpen?.(run.projectPath)}
            onStop={() => onStop(run.runId)}
          />
        ))}
      </ul>
      {hiddenCount > 0 && onOpenAll && (
        <button
          type="button"
          className="dashboard-prompt-status__more"
          onClick={onOpenAll}
        >
          他 {hiddenCount} 件を Prompts タブで見る →
        </button>
      )}
    </section>
  );
};

const StatCard: React.FC<{
  title: string;
  value: number;
  variant?: "primary" | "secondary" | "tertiary" | "warning";
  actionable?: boolean;
}> = ({ title, value, variant = "primary", actionable = false }) => {
  return (
    <div
      className={`stat-card stat-card--${variant} ${actionable ? "stat-card--actionable" : ""}`}
      role={actionable ? "button" : undefined}
      tabIndex={actionable ? 0 : undefined}
      aria-label={`${title}: ${value}`}
    >
      <div className="stat-card__content">
        <h3 className="stat-card__title">{title}</h3>
        <div className="stat-card__value">
          <span className="stat-card__number">{value.toLocaleString()}</span>
        </div>
      </div>
      {actionable && (
        <div className="stat-card__action" aria-hidden="true">
          →
        </div>
      )}
    </div>
  );
};

/**
 * カード上のクイック実行コンポーザー。
 * プロジェクト画面へ移動せずに、Dashboard から直接プロンプトを送れる。
 * 送信処理はストア（sendPrompt）が担うため、実行状況は自動的に
 * カードの状態行・実行状況セクションに反映される。
 */
const QuickPromptComposer: React.FC<{
  projectPath: string;
  /** 送信。失敗時はエラーメッセージを返す（成功時は null） */
  onSend: (
    prompt: string,
    permissionMode: PermissionMode,
  ) => Promise<string | null>;
}> = ({ projectPath, onSend }) => {
  const [open, setOpen] = useState(false);
  const [text, setText] = useState("");
  const [mode, setMode] = useState<PermissionMode>("plan");
  const [confirmOpen, setConfirmOpen] = useState(false);
  const [sending, setSending] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const doSend = useCallback(async () => {
    const prompt = text.trim();
    if (!prompt) return;
    setSending(true);
    setError(null);
    try {
      const failure = await onSend(prompt, mode);
      if (failure) {
        setError(failure);
      } else {
        setText("");
        setOpen(false);
      }
    } finally {
      setSending(false);
    }
  }, [text, mode, onSend]);

  const handleSubmit = useCallback(() => {
    if (!text.trim() || sending) return;
    if (mode === "bypassPermissions") {
      setConfirmOpen(true);
      return;
    }
    void doSend();
  }, [text, sending, mode, doSend]);

  if (!open) {
    return (
      <button
        type="button"
        className="quick-prompt__toggle"
        aria-label={`${getProjectDisplayName(projectPath)} にプロンプトを実行`}
        onClick={(e) => {
          e.stopPropagation();
          setOpen(true);
        }}
      >
        ▷ プロンプトを実行…
      </button>
    );
  }

  return (
    // カード自体がクリック/キーボードで開くため、入力操作が伝播しないよう遮断する
    // biome-ignore lint/a11y/noStaticElementInteractions: イベント伝播の遮断のみが目的
    <div
      className="quick-prompt"
      onClick={(e) => e.stopPropagation()}
      onKeyDown={(e) => e.stopPropagation()}
    >
      <textarea
        className="quick-prompt__textarea"
        value={text}
        onChange={(e) => setText(e.target.value)}
        onKeyDown={(e) => {
          if ((e.metaKey || e.ctrlKey) && e.key === "Enter") {
            e.preventDefault();
            handleSubmit();
          }
        }}
        placeholder="Claude への指示…（Cmd/Ctrl + Enter で送信）"
        rows={2}
        // biome-ignore lint/a11y/noAutofocus: 「実行…」クリック直後の入力開始のため
        autoFocus
      />
      <div className="quick-prompt__controls">
        <select
          aria-label="権限モード"
          value={mode}
          onChange={(e) => setMode(e.target.value as PermissionMode)}
        >
          <option value="plan">読み取り専用</option>
          <option value="acceptEdits">編集を自動承認</option>
          <option value="bypassPermissions">全許可（危険）</option>
        </select>
        <button
          type="button"
          className="quick-prompt__button"
          onClick={() => setOpen(false)}
        >
          キャンセル
        </button>
        <button
          type="button"
          className="quick-prompt__button quick-prompt__button--primary"
          onClick={handleSubmit}
          disabled={!text.trim() || sending}
        >
          送信
        </button>
      </div>
      {error && (
        <div className="quick-prompt__error" role="alert">
          実行を開始できませんでした: {error}
        </div>
      )}
      <SafeConfirmDialog
        isOpen={confirmOpen}
        title="全許可モードで実行しますか？"
        message="「全許可（危険）」は Claude のすべてのツール実行を確認なしで許可します。ファイルの変更やコマンド実行が無条件に行われます。本当に実行しますか？"
        confirmText="実行する"
        cancelText="キャンセル"
        variant="danger"
        onConfirm={() => {
          setConfirmOpen(false);
          void doSend();
        }}
        onCancel={() => setConfirmOpen(false)}
      />
    </div>
  );
};

const ProjectCard: React.FC<{
  project: ProjectSummary;
  onClick: () => void;
  /** このプロジェクトの最新のプロンプト実行（無ければ null） */
  latestRun?: PromptRunInfo | null;
  /** ~/.claude 上の最新セッション（アプリ外での作業も含む） */
  latestSession?: ClaudeSession | null;
  /** クイック実行（Provider 配下でない場合は undefined で非表示） */
  onQuickPrompt?: (
    prompt: string,
    permissionMode: PermissionMode,
  ) => Promise<string | null>;
}> = ({ project, onClick, latestRun, latestSession, onQuickPrompt }) => {
  const projectName =
    project.project_path.split("/").pop() || project.project_path;
  const isActive = project.ide_info?.pid;

  // Generate a gradient based on project name for visual variety
  const gradientIndex =
    Math.abs(projectName.split("").reduce((a, b) => a + b.charCodeAt(0), 0)) %
    5;
  const gradients = [
    "linear-gradient(135deg, #667eea 0%, #764ba2 100%)",
    "linear-gradient(135deg, #f093fb 0%, #f5576c 100%)",
    "linear-gradient(135deg, #4facfe 0%, #00f2fe 100%)",
    "linear-gradient(135deg, #43e97b 0%, #38f9d7 100%)",
    "linear-gradient(135deg, #fa709a 0%, #fee140 100%)",
  ];

  return (
    <article
      className={`project-card-modern ${isActive ? "project-card-modern--active" : ""}`}
      onClick={onClick}
      role="button"
      tabIndex={0}
      aria-label={`Open project ${projectName}`}
      onKeyDown={(e) => {
        if (e.key === "Enter" || e.key === " ") {
          e.preventDefault();
          onClick();
        }
      }}
    >
      <div
        className="project-card-gradient"
        style={{ background: gradients[gradientIndex] }}
      >
        <div className="project-card-pattern"></div>
        <div className="project-card-overlay">
          <span className="project-icon-large">📁</span>
        </div>
      </div>

      <div className="project-card-content">
        <header className="project-card-header-modern">
          <div className="project-title-section">
            <h3 className="project-title-modern">{projectName}</h3>
            {isActive && (
              <span className="active-badge">
                <span className="active-pulse"></span>
                Active
              </span>
            )}
          </div>
        </header>

        <div className="project-path-modern" title={project.project_path}>
          {project.project_path}
        </div>

        {/*
          プロンプト実行状態の行（常時表示）。
          実行が無いプロジェクトも「未実行」を明示し、
          動かしていないことがひと目で分かるようにする。
        */}
        {latestRun ? (
          <div
            className={`project-latest-prompt project-latest-prompt--${latestRun.status}`}
            title={`${RUN_STATUS_META[latestRun.status].label}: ${latestRun.prompt}`}
          >
            <span
              className={`run-status-dot run-status-dot--${latestRun.status}`}
              aria-hidden="true"
            />
            <span className="project-latest-prompt__label">
              {RUN_STATUS_META[latestRun.status].label}
            </span>
            <span className="project-latest-prompt__text">
              {latestRun.prompt}
            </span>
          </div>
        ) : (
          <div className="project-latest-prompt project-latest-prompt--none">
            <span className="run-status-dot" aria-hidden="true" />
            <span className="project-latest-prompt__label">
              プロンプト未実行
            </span>
          </div>
        )}

        {/* アプリ外での作業も含む最新セッションのプレビュー（あれば） */}
        {!latestRun && latestSession?.latest_content_preview && (
          <div
            className="project-latest-prompt project-latest-prompt--session"
            title={latestSession.latest_content_preview}
          >
            {latestSession.is_processing && (
              <span
                className="run-status-dot run-status-dot--running"
                aria-hidden="true"
              />
            )}
            <span className="project-latest-prompt__text">
              {latestSession.latest_content_preview}
            </span>
          </div>
        )}

        {/* カードから直接プロンプトを実行（実行中は状態行が担うため非表示） */}
        {onQuickPrompt && latestRun?.status !== "running" && (
          <QuickPromptComposer
            projectPath={project.project_path}
            onSend={onQuickPrompt}
          />
        )}

        <div className="project-metrics-modern">
          <div className="metric-grid">
            <div className="metric-item-modern">
              <span className="metric-number">{project.session_count}</span>
              <span className="metric-label">Sessions</span>
            </div>
            <div className="metric-item-modern">
              <span className="metric-number">{project.total_messages}</span>
              <span className="metric-label">Messages</span>
            </div>
            {project.active_todos > 0 && (
              <div className="metric-item-modern metric-warning">
                <span className="metric-number">{project.active_todos}</span>
                <span className="metric-label">TODOs</span>
              </div>
            )}
          </div>
        </div>

        <footer className="project-footer-modern">
          <time
            className="last-activity-modern"
            dateTime={project.last_activity}
            title={`Last activity: ${formatDateForContext(project.last_activity, "detail")}`}
          >
            {formatDateForContext(project.last_activity, "card")}
          </time>
          <div className="project-actions">
            <button
              className="action-btn primary"
              onClick={(e) => {
                e.stopPropagation();
                onClick();
              }}
            >
              <span>Open</span>
              <span className="action-arrow">→</span>
            </button>
          </div>
        </footer>
      </div>
    </article>
  );
};

const EmptyState: React.FC<{
  title: string;
  description: string;
  action?: React.ReactNode;
}> = ({ title, description, action }) => (
  <div className="empty-state">
    <div className="empty-state__icon" aria-hidden="true">
      📁
    </div>
    <h3 className="empty-state__title">{title}</h3>
    <p className="empty-state__description">{description}</p>
    {action && <div className="empty-state__action">{action}</div>}
  </div>
);

const LoadingSkeleton: React.FC = () => (
  <div className="dashboard" aria-label="Loading dashboard data">
    <div className="dashboard-header">
      <div className="skeleton skeleton--title"></div>
      <div className="skeleton skeleton--subtitle"></div>
      <div className="skeleton skeleton--actions"></div>
    </div>

    <div className="stats-section">
      <div className="skeleton skeleton--section-title"></div>
      <div className="stats-grid">
        {Array.from({ length: 4 }, (_, i) => (
          <div key={i} className="skeleton skeleton--stat-card"></div>
        ))}
      </div>
    </div>

    <div className="projects-section">
      <div className="skeleton skeleton--section-title"></div>
      <div className="projects-grid">
        {Array.from({ length: 6 }, (_, i) => (
          <div key={i} className="skeleton skeleton--project-card"></div>
        ))}
      </div>
    </div>
  </div>
);

export const Dashboard: React.FC<DashboardProps> = ({
  onProjectClick,
  onOpenPromptRun,
  onOpenPromptsTab,
}) => {
  // Provider 配下でなければ null（既存テストの単体レンダリング等）
  const runsStore = usePromptRunsOptional();
  const allRuns = runsStore?.runs ?? [];

  const handleStopRun = useCallback(
    (runId: string) => {
      runsStore?.stopRun(runId).catch((error: unknown) => {
        console.error("Failed to stop prompt run:", error);
      });
    },
    [runsStore],
  );

  const [stats, setStats] = useState<SessionStats | null>(null);
  const [projects, setProjects] = useState<ProjectSummary[]>([]);
  const [sessions, setSessions] = useState<ClaudeSession[]>([]);
  const [showAllProjects, setShowAllProjects] = useState(false);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [updating, setUpdating] = useState<{
    stats: boolean;
    projects: boolean;
  }>({ stats: false, projects: false });

  // プロジェクトごとの最新セッション（アプリ外での claude 実行も含む）
  const latestSessionByProject = useMemo(() => {
    const map = new Map<string, ClaudeSession>();
    for (const session of sessions) {
      const current = map.get(session.project_path);
      if (
        !current ||
        new Date(session.file_modified_time).getTime() >
          new Date(current.file_modified_time).getTime()
      ) {
        map.set(session.project_path, session);
      }
    }
    return map;
  }, [sessions]);

  const loadInitialData = useCallback(async () => {
    try {
      setLoading(true);
      setError(null);

      const [statsData, projectsData, sessionsData] = await Promise.all([
        api.getSessionStats(),
        api.getProjectSummary(),
        api.getAllSessions(),
      ]);

      setStats(statsData);
      setProjects(projectsData);
      setSessions(sessionsData ?? []);
    } catch (err) {
      setError(
        err instanceof Error ? err.message : "Failed to load dashboard data",
      );
    } finally {
      setLoading(false);
    }
  }, []);

  const updateStats = useCallback(async () => {
    if (updating.stats) return;

    try {
      setUpdating((prev) => ({ ...prev, stats: true }));
      const statsData = await api.getSessionStats();
      setStats(statsData);
    } catch (err) {
      console.error("Failed to update stats:", err);
    } finally {
      setUpdating((prev) => ({ ...prev, stats: false }));
    }
  }, [updating.stats]);

  const updateProjects = useCallback(async () => {
    if (updating.projects) return;

    try {
      setUpdating((prev) => ({ ...prev, projects: true }));
      const [projectsData, sessionsData] = await Promise.all([
        api.getProjectSummary(),
        api.getAllSessions(),
      ]);
      setProjects(projectsData);
      setSessions(sessionsData ?? []);
    } catch (err) {
      console.error("Failed to update projects:", err);
    } finally {
      setUpdating((prev) => ({ ...prev, projects: false }));
    }
  }, [updating.projects]);

  const refreshAllData = useCallback(async () => {
    await Promise.all([updateStats(), updateProjects()]);
  }, [updateStats, updateProjects]);

  useEffect(() => {
    loadInitialData();
  }, [loadInitialData]);

  // Handle Cmd+R / Ctrl+R for refresh
  useEffect(() => {
    const handleKeyDown = (event: KeyboardEvent) => {
      if ((event.metaKey || event.ctrlKey) && event.key === "r") {
        event.preventDefault();
        refreshAllData();
      }
    };

    window.addEventListener("keydown", handleKeyDown);
    return () => window.removeEventListener("keydown", handleKeyDown);
  }, [refreshAllData]);

  if (loading) {
    return <LoadingSkeleton />;
  }

  if (error) {
    return (
      <div className="dashboard-error">
        <div className="error-content">
          <h3 className="error-title">Error loading dashboard</h3>
          <p className="error-message">{error}</p>
          <button className="btn-primary" onClick={loadInitialData}>
            Try Again
          </button>
        </div>
      </div>
    );
  }

  return (
    <div
      className="dashboard"
      role="main"
      aria-label="Claude Code Manager Dashboard"
    >
      <header className="dashboard-header">
        <div className="hero-content">
          <h1 className="dashboard-title">
            Welcome back to Claude Code Manager
          </h1>
          <p className="dashboard-subtitle">
            Manage your Claude Code sessions and track your development progress
          </p>
        </div>
      </header>

      <PromptStatusSection
        runs={allRuns}
        onOpen={onOpenPromptRun}
        onStop={handleStopRun}
        onOpenAll={onOpenPromptsTab}
      />

      <section className="stats-section" aria-labelledby="stats-heading">
        <div className="section-header">
          <h2 id="stats-heading" className="section-title">
            Activity Overview
          </h2>
          <button
            className="refresh-button"
            onClick={refreshAllData}
            aria-label="Refresh dashboard data (Cmd+R)"
            title="Refresh data (Cmd+R)"
          >
            ↻
          </button>
        </div>
        {stats && (
          <div className={`stats-grid ${updating.stats ? "updating" : ""}`}>
            <StatCard
              title="Total Sessions"
              value={stats.total_sessions}
              variant="primary"
            />
            <StatCard
              title="Total Messages"
              value={stats.total_messages}
              variant="secondary"
            />
            <StatCard
              title="Commands Executed"
              value={stats.total_commands}
              variant="tertiary"
            />
            <StatCard
              title="Active Projects"
              value={stats.active_projects}
              variant="secondary"
            />
            <StatCard
              title="Pending TODOs"
              value={stats.pending_todos}
              variant={stats.pending_todos > 0 ? "warning" : "tertiary"}
              actionable={stats.pending_todos > 0}
            />
          </div>
        )}
      </section>

      <section className="projects-section" aria-labelledby="projects-heading">
        <div className="section-header-modern">
          <div className="section-title-group">
            <h2 id="projects-heading" className="section-title-modern">
              Recent Projects
            </h2>
            <p className="section-subtitle">
              Continue working on your latest Claude Code projects
            </p>
          </div>
          <div className="section-controls">
            <span className="project-count-modern">
              {projects.length} {projects.length === 1 ? "project" : "projects"}
            </span>
          </div>
        </div>

        {projects.length === 0 ? (
          <EmptyState
            title="No projects found"
            description="No Claude Code projects have been created yet"
          />
        ) : (
          <>
            <div
              className={`projects-grid ${updating.projects ? "updating" : ""}`}
            >
              {(showAllProjects
                ? projects
                : projects.slice(0, COLLAPSED_PROJECT_COUNT)
              ).map((project) => (
                <ProjectCard
                  key={project.project_path}
                  project={project}
                  latestRun={
                    runsStore?.latestRunByProject.get(project.project_path) ??
                    null
                  }
                  latestSession={
                    latestSessionByProject.get(project.project_path) ?? null
                  }
                  onClick={() => onProjectClick?.(project.project_path)}
                  onQuickPrompt={
                    runsStore
                      ? (prompt, permissionMode) =>
                          runsStore.sendPrompt(project.project_path, {
                            prompt,
                            permissionMode,
                            model: null,
                          })
                      : undefined
                  }
                />
              ))}
            </div>
            {projects.length > COLLAPSED_PROJECT_COUNT && (
              <div className="projects-show-all">
                <button
                  type="button"
                  className="show-all-projects-button"
                  aria-expanded={showAllProjects}
                  onClick={() => setShowAllProjects((prev) => !prev)}
                >
                  {showAllProjects
                    ? "Show less"
                    : `Show all ${projects.length} projects`}
                </button>
              </div>
            )}
          </>
        )}
      </section>
    </div>
  );
};
