import { render, screen, waitFor } from '@testing-library/react';
import { vi, describe, it, expect, beforeEach } from 'vitest';
import { Dashboard } from '../components/Dashboard';
import * as api from '../api';

// Mock the API
vi.mock('../api', () => ({
  api: {
    getSessionStats: vi.fn(),
    getProjectSummary: vi.fn(),
  }
}));

const mockApi = api.api as any;

describe('Dashboard', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('renders loading state initially', () => {
    mockApi.getSessionStats.mockReturnValue(new Promise(() => {})); // Never resolves
    mockApi.getProjectSummary.mockReturnValue(new Promise(() => {}));
    
    render(<Dashboard />);
    expect(screen.getByText('Loading dashboard...')).toBeInTheDocument();
  });

  it('renders dashboard with stats and projects', async () => {
    const mockStats = {
      total_sessions: 10,
      total_messages: 100,
      total_commands: 50,
      active_projects: 3,
      pending_todos: 5
    };

    const mockProjects = [
      {
        project_path: '/test/project1',
        session_count: 5,
        last_activity: '2025-07-20T10:00:00Z',
        total_messages: 50,
        active_todos: 2
      },
      {
        project_path: '/test/project2',
        session_count: 3,
        last_activity: '2025-07-19T15:30:00Z',
        total_messages: 30,
        active_todos: 1
      }
    ];

    mockApi.getSessionStats.mockResolvedValue(mockStats);
    mockApi.getProjectSummary.mockResolvedValue(mockProjects);

    render(<Dashboard />);

    await waitFor(() => {
      expect(screen.getByText('Claude Code Manager Dashboard')).toBeInTheDocument();
    });

    // Check stats are displayed
    expect(screen.getByText('10')).toBeInTheDocument(); // total_sessions
    expect(screen.getByText('100')).toBeInTheDocument(); // total_messages
    expect(screen.getByText('50')).toBeInTheDocument(); // total_commands
    expect(screen.getByText('3')).toBeInTheDocument(); // active_projects
    expect(screen.getByText('5')).toBeInTheDocument(); // pending_todos

    // Check projects are displayed
    expect(screen.getByText('project1')).toBeInTheDocument();
    expect(screen.getByText('project2')).toBeInTheDocument();
  });

  it('handles error state', async () => {
    mockApi.getSessionStats.mockRejectedValue(new Error('API Error'));
    mockApi.getProjectSummary.mockRejectedValue(new Error('API Error'));

    render(<Dashboard />);

    await waitFor(() => {
      expect(screen.getByText('Error loading dashboard')).toBeInTheDocument();
      expect(screen.getByText('API Error')).toBeInTheDocument();
    });
  });

  it('shows retry button on error and calls API again when clicked', async () => {
    mockApi.getSessionStats.mockRejectedValueOnce(new Error('API Error'))
                             .mockResolvedValue({ total_sessions: 5, total_messages: 50, total_commands: 25, active_projects: 2, pending_todos: 3 });
    mockApi.getProjectSummary.mockRejectedValueOnce(new Error('API Error'))
                             .mockResolvedValue([]);

    render(<Dashboard />);

    await waitFor(() => {
      expect(screen.getByText('Retry')).toBeInTheDocument();
    });

    const retryButton = screen.getByText('Retry');
    retryButton.click();

    await waitFor(() => {
      expect(screen.getByText('Claude Code Manager Dashboard')).toBeInTheDocument();
    });

    expect(mockApi.getSessionStats).toHaveBeenCalledTimes(2);
    expect(mockApi.getProjectSummary).toHaveBeenCalledTimes(2);
  });
});