import React, { useEffect, useState, useCallback } from "react";
import { api } from "../api";
import {
  formatElapsed,
  RUN_STATUS_META,
  usePromptRunsOptional,
  type PromptRunInfo,
} from "../contexts/PromptRunsContext";
import { formatDateForContext } from "../utils/dateUtils";
import { getProjectDisplayName } from "../utils/pathUtils";
import type { SessionStats, ProjectSummary } from "../types";

interface DashboardProps {
  onProjectClick?: (projectPath: string) => void;
  /** 実行中プロンプトの行やバッジから Prompt タブ直行で開く */
  onOpenPromptRun?: (projectPath: string) => void;
}

/** Dashboard 上部の「実行中のプロンプト」セクション */
const RunningPromptsSection: React.FC<{
  runs: PromptRunInfo[];
  onOpen?: (projectPath: string) => void;
  onStop: (runId: string) => void;
}> = ({ runs, onOpen, onStop }) => {
  const [now, setNow] = useState(() => Date.now());

  useEffect(() => {
    const timer = setInterval(() => setNow(Date.now()), 1000);
    return () => clearInterval(timer);
  }, []);

  if (runs.length === 0) return null;

  return (
    <section
      className="dashboard-running-section"
      aria-labelledby="running-prompts-heading"
    >
      <div className="section-header">
        <h2 id="running-prompts-heading" className="section-title">
          ▶ 実行中のプロンプト ({runs.length})
        </h2>
      </div>
      <ul className="dashboard-running-section__list">
        {runs.map((run) => (
          <li
            key={run.runId}
            className="prompt-runs-row prompt-runs-row--running"
          >
            <span
              className="prompt-runs-row__icon prompt-runs-row__icon--running"
              role="img"
              aria-label="実行中"
            >
              {RUN_STATUS_META.running.icon}
            </span>
            <div className="prompt-runs-row__body">
              <div className="prompt-runs-row__title">
                <span className="prompt-runs-row__project">
                  {getProjectDisplayName(run.projectPath)}
                </span>
                <span className="prompt-runs-row__meta">
                  <span>{formatElapsed(now - run.startedAt)}</span>
                  <span>{run.permissionMode}</span>
                </span>
              </div>
              <div className="prompt-runs-row__prompt" title={run.prompt}>
                {run.prompt}
              </div>
              {run.lastActivity && (
                <div className="prompt-runs-row__activity">
                  {run.lastActivity}
                </div>
              )}
            </div>
            <div className="prompt-runs-row__actions">
              <button
                type="button"
                className="prompt-runs-row__button"
                onClick={() => onStop(run.runId)}
              >
                停止
              </button>
              {onOpen && (
                <button
                  type="button"
                  className="prompt-runs-row__button prompt-runs-row__button--primary"
                  onClick={() => onOpen(run.projectPath)}
                >
                  開く
                </button>
              )}
            </div>
          </li>
        ))}
      </ul>
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

const ProjectCard: React.FC<{
  project: ProjectSummary;
  onClick: () => void;
  /** このプロジェクトの最新のプロンプト実行（無ければ null） */
  latestRun?: PromptRunInfo | null;
}> = ({ project, onClick, latestRun }) => {
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
            {latestRun && (
              <span
                className={`project-run-badge project-run-badge--${latestRun.status}`}
                title={`プロンプト: ${latestRun.prompt}`}
              >
                {RUN_STATUS_META[latestRun.status].icon}{" "}
                {RUN_STATUS_META[latestRun.status].label}
              </span>
            )}
          </div>
        </header>

        <div className="project-path-modern" title={project.project_path}>
          {project.project_path}
        </div>

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
}) => {
  // Provider 配下でなければ null（既存テストの単体レンダリング等）
  const runsStore = usePromptRunsOptional();
  const runningRuns =
    runsStore?.runs.filter((run) => run.status === "running") ?? [];

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
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [updating, setUpdating] = useState<{
    stats: boolean;
    projects: boolean;
  }>({ stats: false, projects: false });

  const loadInitialData = useCallback(async () => {
    try {
      setLoading(true);
      setError(null);

      const [statsData, projectsData] = await Promise.all([
        api.getSessionStats(),
        api.getProjectSummary(),
      ]);

      setStats(statsData);
      setProjects(projectsData);
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
      const projectsData = await api.getProjectSummary();
      setProjects(projectsData);
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

      <RunningPromptsSection
        runs={runningRuns}
        onOpen={onOpenPromptRun}
        onStop={handleStopRun}
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
          <div
            className={`projects-grid ${updating.projects ? "updating" : ""}`}
          >
            {projects.slice(0, 6).map((project) => (
              <ProjectCard
                key={project.project_path}
                project={project}
                latestRun={
                  runsStore?.latestRunByProject.get(project.project_path) ??
                  null
                }
                onClick={() => onProjectClick?.(project.project_path)}
              />
            ))}
          </div>
        )}
      </section>
    </div>
  );
};
