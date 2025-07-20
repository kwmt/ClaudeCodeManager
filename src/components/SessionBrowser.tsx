import React, { useEffect, useState } from 'react';
import { api } from '../api';
import type { ClaudeSession, ClaudeMessage } from '../types';

interface SessionBrowserProps {}

export const SessionBrowser: React.FC<SessionBrowserProps> = () => {
  const [sessions, setSessions] = useState<ClaudeSession[]>([]);
  const [selectedSession, setSelectedSession] = useState<ClaudeSession | null>(null);
  const [messages, setMessages] = useState<ClaudeMessage[]>([]);
  const [searchQuery, setSearchQuery] = useState('');
  const [loading, setLoading] = useState(true);
  const [loadingMessages, setLoadingMessages] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    loadSessions();
  }, []);

  useEffect(() => {
    if (searchQuery.trim()) {
      searchSessions();
    } else {
      loadSessions();
    }
  }, [searchQuery]);

  const loadSessions = async () => {
    try {
      setLoading(true);
      setError(null);
      const data = await api.getAllSessions();
      setSessions(data);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to load sessions');
    } finally {
      setLoading(false);
    }
  };

  const searchSessions = async () => {
    try {
      setLoading(true);
      setError(null);
      const data = await api.searchSessions(searchQuery);
      setSessions(data);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to search sessions');
    } finally {
      setLoading(false);
    }
  };

  const loadSessionMessages = async (session: ClaudeSession) => {
    try {
      setLoadingMessages(true);
      setSelectedSession(session);
      const data = await api.getSessionMessages(session.session_id);
      setMessages(data);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to load messages');
    } finally {
      setLoadingMessages(false);
    }
  };

  const exportSession = async (sessionId: string) => {
    try {
      const data = await api.exportSessionData(sessionId);
      const blob = new Blob([data], { type: 'application/json' });
      const url = URL.createObjectURL(blob);
      const a = document.createElement('a');
      a.href = url;
      a.download = `session_${sessionId}.json`;
      document.body.appendChild(a);
      a.click();
      document.body.removeChild(a);
      URL.revokeObjectURL(url);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to export session');
    }
  };

  const renderMessageContent = (message: ClaudeMessage) => {
    if (message.message_type === 'User') {
      const content = typeof message.content.content === 'string' ? message.content.content : '';
      return <div className="message-content user-content">{content}</div>;
    } else {
      const content = Array.isArray(message.content.content) ? message.content.content : [];
      return (
        <div className="message-content assistant-content">
          {content.map((block, index) => {
            if (block.type === 'text') {
              return <div key={index} className="text-block">{block.text}</div>;
            } else if (block.type === 'tool_use') {
              return (
                <div key={index} className="tool-use-block">
                  <strong>Tool: {block.name}</strong>
                  <pre>{JSON.stringify(block.input, null, 2)}</pre>
                </div>
              );
            }
            return null;
          })}
        </div>
      );
    }
  };

  if (error) {
    return (
      <div className="session-browser-error">
        <h3>Error</h3>
        <p>{error}</p>
        <button onClick={loadSessions}>Retry</button>
      </div>
    );
  }

  return (
    <div className="session-browser">
      <div className="session-browser-header">
        <h2>Session Browser</h2>
        <div className="search-container">
          <input
            type="text"
            placeholder="Search sessions by project path, branch, or ID..."
            value={searchQuery}
            onChange={(e) => setSearchQuery(e.target.value)}
            className="search-input"
          />
        </div>
      </div>

      <div className="session-browser-content">
        <div className="sessions-list">
          {loading ? (
            <div className="loading">Loading sessions...</div>
          ) : sessions.length === 0 ? (
            <div className="no-sessions">No sessions found</div>
          ) : (
            sessions.map((session) => (
              <div
                key={session.session_id}
                className={`session-item ${selectedSession?.session_id === session.session_id ? 'selected' : ''}`}
                onClick={() => loadSessionMessages(session)}
              >
                <div className="session-header">
                  <h4>{session.project_path.split('/').pop() || session.project_path}</h4>
                  <button
                    className="export-button"
                    onClick={(e) => {
                      e.stopPropagation();
                      exportSession(session.session_id);
                    }}
                  >
                    Export
                  </button>
                </div>
                <p className="session-path">{session.project_path}</p>
                <div className="session-meta">
                  <span>{session.message_count} messages</span>
                  {session.git_branch && <span>Branch: {session.git_branch}</span>}
                  <span>Updated: {new Date(session.updated_at).toLocaleDateString()}</span>
                </div>
              </div>
            ))
          )}
        </div>

        <div className="messages-panel">
          {selectedSession ? (
            <>
              <div className="messages-header">
                <h3>Messages for {selectedSession.project_path.split('/').pop()}</h3>
                <p>Session ID: {selectedSession.session_id}</p>
              </div>
              
              {loadingMessages ? (
                <div className="loading">Loading messages...</div>
              ) : messages.length === 0 ? (
                <div className="no-messages">No messages found</div>
              ) : (
                <div className="messages-list">
                  {messages.map((message) => (
                    <div
                      key={message.uuid}
                      className={`message ${message.message_type.toLowerCase()}`}
                    >
                      <div className="message-header">
                        <span className="message-type">{message.message_type}</span>
                        <span className="message-time">
                          {new Date(message.timestamp).toLocaleString()}
                        </span>
                      </div>
                      {renderMessageContent(message)}
                      {message.cwd && (
                        <div className="message-meta">CWD: {message.cwd}</div>
                      )}
                    </div>
                  ))}
                </div>
              )}
            </>
          ) : (
            <div className="no-session-selected">
              Select a session to view its messages
            </div>
          )}
        </div>
      </div>
    </div>
  );
};