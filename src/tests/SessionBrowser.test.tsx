import { render, screen, waitFor, fireEvent } from '@testing-library/react';
import { vi, describe, it, expect, beforeEach } from 'vitest';
import { SessionBrowser } from '../components/SessionBrowser';
import * as api from '../api';

// Mock the API
vi.mock('../api', () => ({
  api: {
    getAllSessions: vi.fn(),
    searchSessions: vi.fn(),
    getSessionMessages: vi.fn(),
    exportSessionData: vi.fn(),
  }
}));

const mockApi = api.api as any;

describe('SessionBrowser', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  const mockSessions = [
    {
      session_id: 'session1',
      project_path: '/test/project1',
      created_at: '2025-07-20T10:00:00Z',
      updated_at: '2025-07-20T11:00:00Z',
      message_count: 5,
      git_branch: 'main'
    },
    {
      session_id: 'session2',
      project_path: '/test/project2',
      created_at: '2025-07-19T10:00:00Z',
      updated_at: '2025-07-19T11:00:00Z',
      message_count: 3,
      git_branch: 'develop'
    }
  ];

  it('renders session browser with sessions list', async () => {
    mockApi.getAllSessions.mockResolvedValue(mockSessions);

    render(<SessionBrowser />);

    await waitFor(() => {
      expect(screen.getByText('Session Browser')).toBeInTheDocument();
      expect(screen.getByText('project1')).toBeInTheDocument();
      expect(screen.getByText('project2')).toBeInTheDocument();
    });
  });

  it('handles search functionality', async () => {
    mockApi.getAllSessions.mockResolvedValue(mockSessions);
    mockApi.searchSessions.mockResolvedValue([mockSessions[0]]);

    render(<SessionBrowser />);

    await waitFor(() => {
      expect(screen.getByText('project1')).toBeInTheDocument();
    });

    const searchInput = screen.getByPlaceholderText('Search sessions by project path, branch, or ID...');
    fireEvent.change(searchInput, { target: { value: 'project1' } });

    await waitFor(() => {
      expect(mockApi.searchSessions).toHaveBeenCalledWith('project1');
    });
  });

  it('loads session messages when session is clicked', async () => {
    const mockMessages = [
      {
        uuid: 'msg1',
        session_id: 'session1',
        timestamp: '2025-07-20T10:00:00Z',
        message_type: 'User',
        content: { User: { role: 'user', content: 'Hello' } },
        cwd: '/test',
        git_branch: 'main'
      }
    ];

    mockApi.getAllSessions.mockResolvedValue(mockSessions);
    mockApi.getSessionMessages.mockResolvedValue(mockMessages);

    render(<SessionBrowser />);

    await waitFor(() => {
      expect(screen.getByText('project1')).toBeInTheDocument();
    });

    const sessionItem = screen.getByText('project1').closest('.session-item');
    fireEvent.click(sessionItem!);

    await waitFor(() => {
      expect(mockApi.getSessionMessages).toHaveBeenCalledWith('session1');
      expect(screen.getByText('Messages for project1')).toBeInTheDocument();
    });
  });

  it('handles export functionality', async () => {
    mockApi.getAllSessions.mockResolvedValue(mockSessions);
    mockApi.exportSessionData.mockResolvedValue('{"test": "data"}');

    // Mock URL.createObjectURL and document methods
    global.URL.createObjectURL = vi.fn(() => 'blob:test');
    global.URL.revokeObjectURL = vi.fn();
    
    const mockClick = vi.fn();
    const mockAppendChild = vi.fn();
    const mockRemoveChild = vi.fn();
    
    Object.defineProperty(document, 'createElement', {
      value: vi.fn(() => ({
        href: '',
        download: '',
        click: mockClick,
      })),
    });
    
    Object.defineProperty(document.body, 'appendChild', { value: mockAppendChild });
    Object.defineProperty(document.body, 'removeChild', { value: mockRemoveChild });

    render(<SessionBrowser />);

    await waitFor(() => {
      expect(screen.getByText('project1')).toBeInTheDocument();
    });

    const exportButtons = screen.getAllByText('Export');
    fireEvent.click(exportButtons[0]);

    await waitFor(() => {
      expect(mockApi.exportSessionData).toHaveBeenCalledWith('session1');
    });
  });

  it('shows empty state when no sessions found', async () => {
    mockApi.getAllSessions.mockResolvedValue([]);

    render(<SessionBrowser />);

    await waitFor(() => {
      expect(screen.getByText('No sessions found')).toBeInTheDocument();
    });
  });

  it('handles error state', async () => {
    mockApi.getAllSessions.mockRejectedValue(new Error('API Error'));

    render(<SessionBrowser />);

    await waitFor(() => {
      expect(screen.getByText('Error')).toBeInTheDocument();
      expect(screen.getByText('API Error')).toBeInTheDocument();
    });
  });
});