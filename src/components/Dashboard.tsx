import React, { useEffect, useState } from 'react';
import { api } from '../api';
import type { SessionStats, ProjectSummary } from '../types';

interface DashboardProps {}

export const Dashboard: React.FC<DashboardProps> = () => {
  const [stats, setStats] = useState<SessionStats | null>(null);
  const [projects, setProjects] = useState<ProjectSummary[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    loadDashboardData();
  }, []);

  const loadDashboardData = async () => {
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
      setError(err instanceof Error ? err.message : 'Failed to load dashboard data');
    } finally {
      setLoading(false);
    }
  };

  if (loading) {
    return <div className="dashboard-loading">Loading dashboard...</div>;
  }

  if (error) {
    return (
      <div className="dashboard-error">
        <h3>Error loading dashboard</h3>
        <p>{error}</p>
        <button onClick={loadDashboardData}>Retry</button>
      </div>
    );
  }

  return (
    <div className="dashboard">
      <h2>Claude Code Manager Dashboard</h2>
      
      {stats && (
        <div className="stats-grid">
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

      <div className="projects-section">
        <h3>Recent Projects</h3>
        {projects.length === 0 ? (
          <p>No projects found</p>
        ) : (
          <div className="projects-list">
            {projects.slice(0, 10).map((project) => (
              <div key={project.project_path} className="project-card">
                <h4>{project.project_path.split('/').pop() || project.project_path}</h4>
                <p className="project-path">{project.project_path}</p>
                <div className="project-stats">
                  <span>{project.session_count} sessions</span>
                  <span>{project.total_messages} messages</span>
                  <span>{project.active_todos} TODOs</span>
                </div>
                <p className="last-activity">
                  Last activity: {new Date(project.last_activity).toLocaleDateString()}
                </p>
              </div>
            ))}
          </div>
        )}
      </div>
    </div>
  );
};