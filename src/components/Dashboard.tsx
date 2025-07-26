import React, { useEffect, useState, useCallback } from "react";
import { api } from "../api";
import type { SessionStats, ProjectSummary } from "../types";

interface DashboardProps {
  onProjectClick?: (projectPath: string) => void;
}

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
      console.log("Initial data loaded:", { statsData, projectsData });

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

  useEffect(() => {
    loadInitialData();

    // File change events disabled - real-time updates removed
  }, [loadInitialData, updateStats, updateProjects]);

  if (loading) {
    return <div className="dashboard-loading">Loading dashboard...</div>;
  }

  if (error) {
    return (
      <div className="dashboard-error">
        <h3>Error loading dashboard</h3>
        <p>{error}</p>
        <button onClick={loadInitialData}>Retry</button>
      </div>
    );
  }

  return (
    <div className="dashboard">
      <h2>Claude Code Manager Dashboard</h2>

      {stats && (
        <div className={`stats-grid ${updating.stats ? "updating" : ""}`}>
          <div className="stat-card">
            <h3>Total Sessions</h3>
            <p className="stat-value">{stats.total_sessions}</p>
          </div>
          <div className="stat-card">
            <h3>Total Messages</h3>
            <p className="stat-value">{stats.total_messages}</p>
          </div>
          <div className="stat-card">
            <h3>Commands Executed</h3>
            <p className="stat-value">{stats.total_commands}</p>
          </div>
          <div className="stat-card">
            <h3>Active Projects</h3>
            <p className="stat-value">{stats.active_projects}</p>
          </div>
          <div className="stat-card">
            <h3>Pending TODOs</h3>
            <p className="stat-value">{stats.pending_todos}</p>
          </div>
        </div>
      )}

      <div
        className={`projects-section ${updating.projects ? "updating" : ""}`}
      >
        <h3>Recent Projects</h3>
        {projects.length === 0 ? (
          <p>No projects found</p>
        ) : (
          <div className="projects-list">
            {projects.slice(0, 10).map((project) => (
              <div
                key={project.project_path}
                className="project-card clickable"
                onClick={() => onProjectClick?.(project.project_path)}
              >
                <h4>
                  {project.project_path.split("/").pop() ||
                    project.project_path}
                </h4>
                <p className="project-path">{project.project_path}</p>
                <div className="project-stats">
                  <span>{project.session_count} sessions</span>
                  <span>{project.total_messages} messages</span>
                  <span>{project.active_todos} TODOs</span>
                </div>
                <p className="last-activity">
                  Last activity:{" "}
                  {new Date(project.last_activity).toLocaleString()}
                </p>
              </div>
            ))}
          </div>
        )}
      </div>
    </div>
  );
};
