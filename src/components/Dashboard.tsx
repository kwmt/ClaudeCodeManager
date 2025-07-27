import React, { useEffect, useState, useCallback } from "react";
import { api } from "../api";
import type { SessionStats, ProjectSummary } from "../types";

interface DashboardProps {
  onProjectClick?: (projectPath: string) => void;
}

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
}> = ({ project, onClick }) => {
  const projectName =
    project.project_path.split("/").pop() || project.project_path;
  const isActive = project.ide_info?.pid;

  const formatRelativeTime = (dateString: string) => {
    const date = new Date(dateString);
    const now = new Date();
    const diffMs = now.getTime() - date.getTime();
    const diffDays = Math.floor(diffMs / (1000 * 60 * 60 * 24));

    if (diffDays === 0) return "Today";
    if (diffDays === 1) return "Yesterday";
    if (diffDays < 7) return `${diffDays} days ago`;
    return date.toLocaleDateString();
  };

  return (
    <article
      className={`project-card ${isActive ? "project-card--active" : ""}`}
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
      <header className="project-card__header">
        <div className="project-card__title-group">
          <h3 className="project-card__title">{projectName}</h3>
          {isActive && (
            <span
              className="project-card__status"
              aria-label="Project is active"
            >
              <span className="active-dot" aria-hidden="true"></span>
              Active
            </span>
          )}
        </div>
      </header>

      <div className="project-card__path" title={project.project_path}>
        {project.project_path}
      </div>

      <div className="project-card__metrics">
        <div className="metric-item">
          <span className="metric-label">Sessions</span>
          <span className="metric-value">{project.session_count}</span>
        </div>
        <div className="metric-item">
          <span className="metric-label">Messages</span>
          <span className="metric-value">{project.total_messages}</span>
        </div>
        {project.active_todos > 0 && (
          <div className="metric-item metric-item--warning">
            <span className="metric-label">TODOs</span>
            <span className="metric-value">{project.active_todos}</span>
          </div>
        )}
      </div>

      <footer className="project-card__footer">
        <time
          className="project-card__last-activity"
          dateTime={project.last_activity}
          title={`Last activity: ${new Date(project.last_activity).toLocaleString()}`}
        >
          {formatRelativeTime(project.last_activity)}
        </time>
        {project.ide_info && (
          <span className="project-card__ide">{project.ide_info.ide_name}</span>
        )}
      </footer>
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

export const Dashboard: React.FC<DashboardProps> = ({ onProjectClick }) => {
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
        <div className="section-header">
          <h2 id="projects-heading" className="section-title">
            Recent Projects
          </h2>
          <div className="section-controls">
            <span className="project-count">
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
                onClick={() => onProjectClick?.(project.project_path)}
              />
            ))}
          </div>
        )}
      </section>
    </div>
  );
};
