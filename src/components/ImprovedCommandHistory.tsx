import React, { useEffect, useState, useCallback, useMemo } from "react";
import { api } from "../api";
import type { CommandLogEntry } from "../types";
import { formatDateTime, formatDateTooltip } from "../utils/dateUtils";
import { useDebounce } from "../hooks/useDebounce";
import { ErrorBoundary, CommandHistoryErrorFallback } from "./ErrorBoundary";

interface CommandHistoryProps {}

// Enhanced statistics component
const CommandStatistics: React.FC<{ commands: CommandLogEntry[] }> = ({
  commands,
}) => {
  const stats = useMemo(() => {
    const totalCommands = commands.length;
    const uniqueUsers = new Set(commands.map((cmd) => cmd.user)).size;
    const recentCommands = commands.filter((cmd) => {
      const cmdDate = new Date(cmd.timestamp);
      const dayAgo = new Date(Date.now() - 24 * 60 * 60 * 1000);
      return cmdDate > dayAgo;
    }).length;

    return { totalCommands, uniqueUsers, recentCommands };
  }, [commands]);

  return (
    <div className="command-statistics">
      <div className="stat-item">
        <span className="stat-value">{stats.totalCommands}</span>
        <span className="stat-label">Total Commands</span>
      </div>
      <div className="stat-item">
        <span className="stat-value">{stats.uniqueUsers}</span>
        <span className="stat-label">Users</span>
      </div>
      <div className="stat-item">
        <span className="stat-value">{stats.recentCommands}</span>
        <span className="stat-label">Last 24h</span>
      </div>
    </div>
  );
};

// Enhanced search with filters
const SearchControls: React.FC<{
  searchQuery: string;
  onSearchChange: (query: string) => void;
  onExport: () => void;
  commands: CommandLogEntry[];
}> = ({ searchQuery, onSearchChange, onExport, commands }) => {
  const [filterUser, setFilterUser] = useState("");

  const uniqueUsers = useMemo(() => {
    return Array.from(new Set(commands.map((cmd) => cmd.user))).sort();
  }, [commands]);

  return (
    <div className="search-controls">
      <div className="search-primary">
        <div className="search-input-wrapper">
          <input
            type="text"
            placeholder="Search commands, paths, or content..."
            value={searchQuery}
            onChange={(e) => onSearchChange(e.target.value)}
            className="search-input enhanced"
            aria-label="Search commands"
          />
          <div className="search-icon">🔍</div>
        </div>

        <select
          value={filterUser}
          onChange={(e) => setFilterUser(e.target.value)}
          className="user-filter"
          aria-label="Filter by user"
        >
          <option value="">All Users</option>
          {uniqueUsers.map((user) => (
            <option key={user} value={user}>
              {user}
            </option>
          ))}
        </select>
      </div>

      <div className="search-actions">
        <button
          onClick={onExport}
          className="export-button enhanced"
          title="Export command history"
        >
          📊 Export
        </button>
      </div>
    </div>
  );
};

// Progress indicator for long lists
const ScrollProgress: React.FC<{
  containerRef: React.RefObject<HTMLDivElement | null>;
}> = ({ containerRef }) => {
  const [scrollProgress, setScrollProgress] = useState(0);

  useEffect(() => {
    const container = containerRef.current;
    if (!container) return;

    const updateProgress = () => {
      const { scrollTop, scrollHeight, clientHeight } = container;
      const progress =
        scrollHeight > clientHeight
          ? (scrollTop / (scrollHeight - clientHeight)) * 100
          : 0;
      setScrollProgress(progress);
    };

    container.addEventListener("scroll", updateProgress, { passive: true });
    updateProgress(); // Initial calculation

    return () => container?.removeEventListener("scroll", updateProgress);
  }, [containerRef]);

  if (scrollProgress === 0) return null;

  return (
    <div className="scroll-progress-container">
      <div
        className="scroll-progress-bar"
        style={{ width: `${scrollProgress}%` }}
        role="progressbar"
        aria-valuenow={Math.round(scrollProgress)}
        aria-valuemin={0}
        aria-valuemax={100}
        aria-label={`Scrolled ${Math.round(scrollProgress)}% through command list`}
      />
    </div>
  );
};

export const ImprovedCommandHistory: React.FC<CommandHistoryProps> = () => {
  const [commands, setCommands] = useState<CommandLogEntry[]>([]);
  const [searchQuery, setSearchQuery] = useState("");
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [copyFeedback, setCopyFeedback] = useState<number | null>(null);
  const scrollContainerRef = React.useRef<HTMLDivElement>(null);

  useEffect(() => {
    loadCommands();
  }, []);

  // Debounced search to improve performance
  const debouncedSearch = useDebounce(async (query: string) => {
    if (query.trim()) {
      await searchCommands();
    } else {
      await loadCommands();
    }
  }, 300);

  useEffect(() => {
    debouncedSearch(searchQuery);
  }, [searchQuery, debouncedSearch]);

  const loadCommands = async () => {
    try {
      setLoading(true);
      setError(null);
      const data = await api.getCommandHistory();
      setCommands(data);
    } catch (err) {
      setError(
        err instanceof Error ? err.message : "Failed to load command history",
      );
    } finally {
      setLoading(false);
    }
  };

  const searchCommands = async () => {
    try {
      setLoading(true);
      setError(null);
      const data = await api.searchCommands(searchQuery);
      setCommands(data);
    } catch (err) {
      setError(
        err instanceof Error ? err.message : "Failed to search commands",
      );
    } finally {
      setLoading(false);
    }
  };

  const copyCommand = useCallback(async (command: string, index: number) => {
    try {
      await navigator.clipboard.writeText(command);
      setCopyFeedback(index);

      // Announce to screen readers
      const announcement = document.createElement("div");
      announcement.setAttribute("aria-live", "polite");
      announcement.setAttribute("aria-atomic", "true");
      announcement.className = "sr-only";
      announcement.textContent = "Command copied to clipboard";
      document.body.appendChild(announcement);

      setTimeout(() => {
        document.body.removeChild(announcement);
      }, 1000);
    } catch (err) {
      console.error("Failed to copy command:", err);
    }
  }, []);

  // Cleanup copy feedback with proper memory management
  useEffect(() => {
    if (copyFeedback !== null) {
      const timeoutId = setTimeout(() => setCopyFeedback(null), 2000);
      return () => clearTimeout(timeoutId);
    }
  }, [copyFeedback]);

  const exportCommands = async () => {
    try {
      const data = JSON.stringify(commands, null, 2);
      const blob = new Blob([data], { type: "application/json" });
      const url = URL.createObjectURL(blob);
      const a = document.createElement("a");
      a.href = url;
      a.download = `command_history_${new Date().toISOString().split("T")[0]}.json`;
      document.body.appendChild(a);
      a.click();
      document.body.removeChild(a);
      URL.revokeObjectURL(url);
    } catch (err) {
      setError(
        err instanceof Error ? err.message : "Failed to export commands",
      );
    }
  };

  if (error) {
    return (
      <div className="command-history-error enhanced">
        <div className="error-icon">⚠️</div>
        <h3>Unable to Load Command History</h3>
        <p>{error}</p>
        <button onClick={loadCommands} className="retry-button">
          🔄 Try Again
        </button>
      </div>
    );
  }

  return (
    <ErrorBoundary
      fallback={
        <CommandHistoryErrorFallback
          error={new Error("Failed to load command history")}
          retry={loadCommands}
        />
      }
      onError={(error, errorInfo) => {
        console.error("CommandHistory Error:", error, errorInfo);
      }}
    >
      <div className="command-history enhanced">
        <header className="command-history-header enhanced">
          <div className="header-content">
            <h2>Command History</h2>
            {!loading && commands.length > 0 && (
              <CommandStatistics commands={commands} />
            )}
          </div>

          <SearchControls
            searchQuery={searchQuery}
            onSearchChange={setSearchQuery}
            onExport={exportCommands}
            commands={commands}
          />
        </header>

        <div className="command-history-content enhanced">
          <ScrollProgress containerRef={scrollContainerRef} />

          {loading ? (
            <div className="loading enhanced" aria-live="polite">
              <div className="loading-spinner"></div>
              <span>Loading command history...</span>
            </div>
          ) : commands.length === 0 ? (
            <div className="no-commands enhanced" role="status">
              <div className="empty-icon">📝</div>
              <h3>No Commands Found</h3>
              <p>
                {searchQuery
                  ? `No commands match your search for "${searchQuery}"`
                  : "No command history available yet"}
              </p>
            </div>
          ) : (
            <div
              ref={scrollContainerRef}
              className="commands-list enhanced"
              role="log"
              aria-label={`Command history list with ${commands.length} commands`}
            >
              <EnhancedVirtualizedCommandList
                commands={commands}
                onCopyCommand={copyCommand}
                copyFeedback={copyFeedback}
              />
            </div>
          )}
        </div>
      </div>
    </ErrorBoundary>
  );
};

// Enhanced command list component placeholder
const EnhancedVirtualizedCommandList: React.FC<{
  commands: CommandLogEntry[];
  onCopyCommand: (command: string, index: number) => void;
  copyFeedback: number | null;
}> = ({ commands, onCopyCommand, copyFeedback }) => {
  // This would use the existing VirtualizedCommandList but with enhanced styling
  // For now, using a simplified version
  return (
    <>
      {commands.map((cmd, index) => (
        <article
          key={`${cmd.timestamp}-${index}`}
          className="command-item enhanced"
        >
          <header className="command-header">
            <div className="command-meta">
              <span className="command-user">{cmd.user}</span>
              <time
                className="command-time"
                dateTime={cmd.timestamp}
                title={formatDateTooltip(cmd.timestamp)}
              >
                {formatDateTime(cmd.timestamp, { style: "technical" })}
              </time>
            </div>
            <button
              className={`copy-button ${copyFeedback === index ? "copied" : ""}`}
              onClick={() => onCopyCommand(cmd.command, index)}
              title="Copy command to clipboard"
              aria-label="Copy command to clipboard"
            >
              {copyFeedback === index ? "✅" : "📋"}
            </button>
          </header>

          <div className="command-text">
            <pre>
              <code>{cmd.command}</code>
            </pre>
          </div>

          {cmd.cwd && (
            <div className="command-cwd">
              <span className="cwd-label">📁</span>
              <span className="cwd-path">{cmd.cwd}</span>
            </div>
          )}
        </article>
      ))}
    </>
  );
};
