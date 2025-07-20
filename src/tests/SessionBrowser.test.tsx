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
  
  afterEach(() => {
    vi.restoreAllMocks();
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

  it('displays user message content correctly', async () => {
    const mockMessages = [
      {
        uuid: 'msg1',
        session_id: 'session1',
        timestamp: '2025-07-20T10:00:00Z',
        message_type: 'User',
        content: { User: { role: 'user', content: 'Hello, can you help me with TypeScript?' } },
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
      expect(screen.getByText('Messages for project1')).toBeInTheDocument();
    });

    // Wait for messages to load with extended timeout for CI
    await waitFor(() => {
      expect(document.querySelector('.user-content')).toBeInTheDocument();
    }, { timeout: 5000 });

    // Check that user message content exists and has correct content
    const userContent = document.querySelector('.user-content');
    expect(userContent).toHaveTextContent('Hello, can you help me with TypeScript?');
  });

  it('displays assistant message with text blocks correctly', async () => {
    const mockMessages = [
      {
        uuid: 'msg2',
        session_id: 'session1',
        timestamp: '2025-07-20T10:01:00Z',
        message_type: 'Assistant',
        content: {
          Assistant: {
            role: 'assistant',
            content: [
              { Text: { text: 'Of course! I\'d be happy to help you with TypeScript.' } },
              { Text: { text: 'What specific aspect would you like to know about?' } }
            ]
          }
        },
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
      expect(screen.getByText('Messages for project1')).toBeInTheDocument();
    });

    // Wait for assistant content to load with extended timeout for CI
    await waitFor(() => {
      expect(document.querySelector('.assistant-content')).toBeInTheDocument();
    }, { timeout: 5000 });

    // Wait for text blocks to be rendered
    await waitFor(() => {
      expect(document.querySelectorAll('.text-block')).toHaveLength(2);
    }, { timeout: 5000 });
    
    const textBlocks = document.querySelectorAll('.text-block');
    expect(textBlocks[0]).toHaveTextContent('Of course! I\'d be happy to help you with TypeScript.');
    expect(textBlocks[1]).toHaveTextContent('What specific aspect would you like to know about?');
  });

  it('displays assistant message with tool use correctly', async () => {
    const mockMessages = [
      {
        uuid: 'msg3',
        session_id: 'session1',
        timestamp: '2025-07-20T10:02:00Z',
        message_type: 'Assistant',
        content: {
          Assistant: {
            role: 'assistant',
            content: [
              { Text: { text: 'Let me check your TypeScript configuration.' } },
              { 
                ToolUse: { 
                  id: 'tool1',
                  name: 'Read',
                  input: { file_path: '/test/tsconfig.json' }
                }
              }
            ]
          }
        },
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
      expect(screen.getByText('Messages for project1')).toBeInTheDocument();
    });

    // Wait for assistant content to load with extended timeout for CI
    await waitFor(() => {
      expect(document.querySelector('.assistant-content')).toBeInTheDocument();
    }, { timeout: 5000 });

    // Wait for content blocks to be rendered
    await waitFor(() => {
      expect(document.querySelector('.text-block')).toBeInTheDocument();
    }, { timeout: 5000 });

    await waitFor(() => {
      expect(document.querySelector('.tool-use-block')).toBeInTheDocument();
    }, { timeout: 5000 });
    
    // Check for text content
    const assistantContent = document.querySelector('.assistant-content');
    expect(assistantContent).toHaveTextContent('Let me check your TypeScript configuration.');
    expect(assistantContent).toHaveTextContent('Tool: Read');
  });

  it('handles export functionality', async () => {
    mockApi.getAllSessions.mockResolvedValue(mockSessions);
    mockApi.exportSessionData.mockResolvedValue('{"test": "data"}');

    // Mock URL.createObjectURL and document methods
    const originalCreateObjectURL = globalThis.URL.createObjectURL;
    const originalRevokeObjectURL = globalThis.URL.revokeObjectURL;
    globalThis.URL.createObjectURL = vi.fn(() => 'blob:test');
    globalThis.URL.revokeObjectURL = vi.fn();
    
    const mockClick = vi.fn();
    const originalCreateElement = document.createElement.bind(document);
    
    vi.spyOn(document, 'createElement').mockImplementation((tagName: string) => {
      if (tagName === 'a') {
        const element = originalCreateElement(tagName) as HTMLAnchorElement;
        element.click = mockClick;
        return element;
      }
      return originalCreateElement(tagName);
    });

    render(<SessionBrowser />);

    await waitFor(() => {
      expect(screen.getByText('project1')).toBeInTheDocument();
    });

    const exportButtons = screen.getAllByText('Export');
    fireEvent.click(exportButtons[0]);

    await waitFor(() => {
      expect(mockApi.exportSessionData).toHaveBeenCalledWith('session1');
    });
    
    // Restore URL methods
    globalThis.URL.createObjectURL = originalCreateObjectURL;
    globalThis.URL.revokeObjectURL = originalRevokeObjectURL;
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