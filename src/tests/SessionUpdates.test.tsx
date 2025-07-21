import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, waitFor } from '@testing-library/react';
import { SessionBrowser } from '../components/SessionBrowser';
import { mockApi } from '../api-mock';

// Mock the API
vi.mock('../api', () => ({
  api: {
    getAllSessions: vi.fn(() => mockApi.getAllSessions()),
    getChangedSessions: vi.fn(() => Promise.resolve([])),
    getSessionMessages: vi.fn((sessionId: string) => mockApi.getSessionMessages(sessionId)),
    exportSessionData: vi.fn((sessionId: string) => mockApi.exportSessionData(sessionId)),
    startFileWatcher: vi.fn(() => Promise.resolve()),
  },
}));

// Mock the global event listener
const mockAddEventListener = vi.fn();
const mockRemoveEventListener = vi.fn();

Object.defineProperty(window, 'addEventListener', {
  value: mockAddEventListener,
});

Object.defineProperty(window, 'removeEventListener', {
  value: mockRemoveEventListener,
});

describe('Session Updates Optimization', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('should register event listener for claude-data-changed events', async () => {
    render(<SessionBrowser />);
    
    await waitFor(() => {
      expect(mockAddEventListener).toHaveBeenCalledWith(
        'claude-data-changed',
        expect.any(Function)
      );
    });
  });

  it('should show refreshing indicator when updating sessions', async () => {
    const { api } = await import('../api');
    
    // Create a slow promise to simulate network delay
    let resolvePromise: (value: any) => void;
    const slowPromise = new Promise((resolve) => {
      resolvePromise = resolve;
    });
    
    vi.mocked(api.getChangedSessions).mockReturnValueOnce(slowPromise as any);
    
    render(<SessionBrowser />);
    
    // Wait for initial load to complete
    await waitFor(() => {
      expect(screen.getByText(/Session Browser/)).toBeInTheDocument();
    });
    
    // Trigger the data changed event
    const eventHandler = mockAddEventListener.mock.calls.find(
      call => call[0] === 'claude-data-changed'
    )?.[1];
    
    if (eventHandler) {
      eventHandler(new Event('claude-data-changed'));
      
      // Check if refreshing indicator appears
      await waitFor(() => {
        expect(screen.getByText(/🔄/)).toBeInTheDocument();
      }, { timeout: 100 });
      
      // Resolve the promise to complete the update
      resolvePromise!([]);
      
      // Wait for refreshing indicator to disappear
      await waitFor(() => {
        expect(screen.queryByText(/🔄/)).not.toBeInTheDocument();
      });
    }
  });

  it('should not show loading state during selective updates', async () => {
    const { api } = await import('../api');
    
    render(<SessionBrowser />);
    
    // Wait for initial load to complete - wait for sessions to appear
    await waitFor(() => {
      expect(screen.queryByText(/Loading sessions/)).not.toBeInTheDocument();
    }, { timeout: 2000 });
    
    // Verify initial loading is complete
    expect(screen.getByText(/Session Browser/)).toBeInTheDocument();
    
    // Mock getChangedSessions to return some data
    vi.mocked(api.getChangedSessions).mockResolvedValueOnce([]);
    
    // Trigger the data changed event
    const eventHandler = mockAddEventListener.mock.calls.find(
      call => call[0] === 'claude-data-changed'
    )?.[1];
    
    if (eventHandler) {
      eventHandler(new Event('claude-data-changed'));
      
      // Should not show loading state during selective update
      expect(screen.queryByText(/Loading sessions/)).not.toBeInTheDocument();
      
      await waitFor(() => {
        expect(api.getChangedSessions).toHaveBeenCalled();
      });
    }
  });

  it('should clean up event listener on unmount', () => {
    const { unmount } = render(<SessionBrowser />);
    
    unmount();
    
    expect(mockRemoveEventListener).toHaveBeenCalledWith(
      'claude-data-changed',
      expect.any(Function)
    );
  });
});