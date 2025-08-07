import React, {
  useEffect,
  useState,
  useCallback,
  useMemo,
  useRef,
} from "react";
import { api } from "../../api";
import type { CommandLogEntry } from "../../types";
import { formatDateTime, formatDateTooltip } from "../../utils/dateUtils";
import TextHighlight from "../ui/TextHighlight";

// Custom debounce hook for search optimization
const useDebounce = (value: string, delay: number) => {
  const [debouncedValue, setDebouncedValue] = useState(value);

  useEffect(() => {
    const handler = setTimeout(() => {
      setDebouncedValue(value);
    }, delay);

    return () => {
      clearTimeout(handler);
    };
  }, [value, delay]);

  return debouncedValue;
};

// Loading skeleton component
const CommandSkeleton = React.memo(() => (
  <div
    className="command-card skeleton"
    role="status"
    aria-label="Loading command entry"
  >
    <div className="command-card-header">
      <div className="skeleton-text skeleton-text--sm"></div>
      <div className="skeleton-text skeleton-text--xs"></div>
    </div>
    <div className="command-card-content">
      <div className="skeleton-text skeleton-text--lg"></div>
      <div className="skeleton-text skeleton-text--md"></div>
    </div>
  </div>
));

CommandSkeleton.displayName = "CommandSkeleton";

// Toast notification component
interface ToastProps {
  message: string;
  type: "success" | "error";
  onClose: () => void;
}

const Toast = React.memo<ToastProps>(({ message, type, onClose }) => {
  useEffect(() => {
    const timer = setTimeout(onClose, 2000);
    return () => clearTimeout(timer);
  }, [onClose]);

  return (
    <div
      className={`toast toast--${type}`}
      role="alert"
      aria-live="polite"
      aria-atomic="true"
    >
      <span className="toast-message">{message}</span>
      <button
        type="button"
        className="toast-close"
        onClick={onClose}
        aria-label="Close notification"
      >
        ×
      </button>
    </div>
  );
});

Toast.displayName = "Toast";

// Command card component
interface CommandCardProps {
  command: CommandLogEntry;
  onCopy: (command: string) => void;
  searchQuery: string;
}

const CommandCard = React.memo<CommandCardProps>(
  ({ command, onCopy, searchQuery }) => {
    const handleCopy = useCallback(() => {
      onCopy(command.command);
    }, [onCopy, command.command]);

    const handleKeyDown = useCallback(
      (event: React.KeyboardEvent) => {
        if (event.key === "Enter" || event.key === " ") {
          event.preventDefault();
          handleCopy();
        }
      },
      [handleCopy],
    );

    return (
      <article
        className="command-card"
        role="article"
        aria-labelledby={`command-${command.timestamp}`}
      >
        <header className="command-card-header">
          <div className="command-meta">
            <time
              className="command-timestamp"
              dateTime={command.timestamp}
              title={formatDateTooltip(command.timestamp)}
            >
              {formatDateTime(command.timestamp)}
            </time>
            <span
              className="command-user"
              aria-label={`Executed by ${command.user}`}
            >
              {command.user}
            </span>
          </div>
          <button
            type="button"
            className="copy-button"
            onClick={handleCopy}
            onKeyDown={handleKeyDown}
            aria-label={`Copy command: ${command.command}`}
            title="Copy command to clipboard"
          >
            <svg
              width="16"
              height="16"
              viewBox="0 0 16 16"
              fill="currentColor"
              aria-hidden="true"
            >
              <path d="M4 1.5H3a2 2 0 0 0-2 2V14a2 2 0 0 0 2 2h10a2 2 0 0 0 2-2V3.5a2 2 0 0 0-2-2h-1v1h1a1 1 0 0 1 1 1V14a1 1 0 0 1-1 1H3a1 1 0 0 1-1-1V3.5a1 1 0 0 1 1-1h1v-1z" />
              <path d="M9.5 1a.5.5 0 0 1 .5.5v1a.5.5 0 0 1-.5.5h-3a.5.5 0 0 1-.5-.5v-1a.5.5 0 0 1 .5-.5h3zm-3-1A1.5 1.5 0 0 0 5 1.5v1A1.5 1.5 0 0 0 6.5 4h3A1.5 1.5 0 0 0 11 2.5v-1A1.5 1.5 0 0 0 9.5 0h-3z" />
            </svg>
            Copy
          </button>
        </header>

        <div className="command-card-content">
          <div className="command-text" id={`command-${command.timestamp}`}>
            <code className="command-code">
              <TextHighlight
                text={command.command}
                searchQuery={searchQuery}
                highlightClassName="command-highlight"
              />
            </code>
          </div>
          {command.cwd && (
            <div
              className="command-cwd"
              aria-label={`Working directory: ${command.cwd}`}
            >
              <span className="cwd-label">Directory:</span>
              <code className="cwd-path">{command.cwd}</code>
            </div>
          )}
        </div>
      </article>
    );
  },
);

CommandCard.displayName = "CommandCard";

// Empty state component
const EmptyState = React.memo<{ hasSearch: boolean; onClear?: () => void }>(
  ({ hasSearch, onClear }) => (
    <div className="empty-state" role="status">
      <div className="empty-state-icon" aria-hidden="true">
        <svg width="48" height="48" viewBox="0 0 24 24" fill="currentColor">
          <path d="M4 6h16v2H4zm0 5h16v2H4zm0 5h16v2H4z" />
        </svg>
      </div>
      <h3 className="empty-state-title">
        {hasSearch
          ? "No matching commands found"
          : "No command history available"}
      </h3>
      <p className="empty-state-description">
        {hasSearch
          ? "Try adjusting your search terms or clearing the search to see all commands."
          : "Command history will appear here once you start using Claude Code CLI."}
      </p>
      {hasSearch && onClear && (
        <button
          type="button"
          className="button button--secondary"
          onClick={onClear}
        >
          Clear Search
        </button>
      )}
    </div>
  ),
);

EmptyState.displayName = "EmptyState";

// Error state component
const ErrorState = React.memo<{ error: string; onRetry: () => void }>(
  ({ error, onRetry }) => (
    <div className="error-state" role="alert">
      <div className="error-state-icon" aria-hidden="true">
        <svg width="48" height="48" viewBox="0 0 24 24" fill="currentColor">
          <path d="M12 2C6.48 2 2 6.48 2 12s4.48 10 10 10 10-4.48 10-10S17.52 2 12 2zM13 17h-2v-2h2v2zm0-4h-2V7h2v6z" />
        </svg>
      </div>
      <h3 className="error-state-title">Failed to load command history</h3>
      <p className="error-state-description">{error}</p>
      <button
        type="button"
        className="button button--primary"
        onClick={onRetry}
      >
        Retry
      </button>
    </div>
  ),
);

ErrorState.displayName = "ErrorState";

// Main CommandHistory component
const CommandHistory: React.FC = () => {
  const [commands, setCommands] = useState<CommandLogEntry[]>([]);
  const [searchQuery, setSearchQuery] = useState("");
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [toast, setToast] = useState<{
    message: string;
    type: "success" | "error";
  } | null>(null);
  const [isExporting, setIsExporting] = useState(false);

  const searchInputRef = useRef<HTMLInputElement>(null);
  const debouncedSearchQuery = useDebounce(searchQuery, 300);

  // Load commands function
  const loadCommands = useCallback(async () => {
    try {
      setLoading(true);
      setError(null);
      const commandHistory = await api.getCommandHistory();
      setCommands(commandHistory);
    } catch (err) {
      const errorMessage =
        err instanceof Error ? err.message : "Failed to load command history";
      setError(errorMessage);
      console.error("Error loading command history:", err);
    } finally {
      setLoading(false);
    }
  }, []);

  // Search commands function
  const searchCommands = useCallback(
    async (query: string) => {
      if (!query.trim()) {
        await loadCommands();
        return;
      }

      try {
        setLoading(true);
        setError(null);
        const results = await api.searchCommands(query);
        setCommands(results);
      } catch (err) {
        const errorMessage =
          err instanceof Error ? err.message : "Failed to search commands";
        setError(errorMessage);
        console.error("Error searching commands:", err);
      } finally {
        setLoading(false);
      }
    },
    [loadCommands],
  );

  // Copy command function with security validation
  const copyCommand = useCallback(async (command: string) => {
    try {
      // Validate clipboard API availability
      if (!navigator.clipboard) {
        throw new Error("Clipboard API not available");
      }

      // Sanitize command before copying (basic validation)
      const sanitizedCommand = command.trim();
      if (!sanitizedCommand) {
        throw new Error("Invalid command");
      }

      await navigator.clipboard.writeText(sanitizedCommand);
      setToast({ message: "Command copied to clipboard", type: "success" });
    } catch (err) {
      const errorMessage =
        err instanceof Error ? err.message : "Failed to copy command";
      setToast({ message: errorMessage, type: "error" });
      console.error("Error copying command:", err);
    }
  }, []);

  // Export commands function with secure blob handling
  const exportCommands = useCallback(async () => {
    try {
      setIsExporting(true);

      if (commands.length === 0) {
        setToast({ message: "No commands to export", type: "error" });
        return;
      }

      // Create export data with proper structure
      const exportData = {
        exportedAt: new Date().toISOString(),
        totalCommands: commands.length,
        commands: commands.map((cmd) => ({
          timestamp: cmd.timestamp,
          user: cmd.user,
          command: cmd.command,
          cwd: cmd.cwd || undefined,
        })),
      };

      const jsonString = JSON.stringify(exportData, null, 2);
      const blob = new Blob([jsonString], { type: "application/json" });

      // Create secure download link
      const url = URL.createObjectURL(blob);

      try {
        const link = document.createElement("a");
        link.href = url;
        link.download = `command-history-${new Date().toISOString().split("T")[0]}.json`;
        link.style.display = "none";

        document.body.appendChild(link);
        link.click();
        document.body.removeChild(link);

        setToast({
          message: "Commands exported successfully",
          type: "success",
        });
      } finally {
        // Clean up blob URL to prevent memory leaks
        URL.revokeObjectURL(url);
      }
    } catch (err) {
      const errorMessage =
        err instanceof Error ? err.message : "Failed to export commands";
      setToast({ message: errorMessage, type: "error" });
      console.error("Error exporting commands:", err);
    } finally {
      setIsExporting(false);
    }
  }, [commands]);

  // Clear search function
  const clearSearch = useCallback(() => {
    setSearchQuery("");
    if (searchInputRef.current) {
      searchInputRef.current.focus();
    }
  }, []);

  // Close toast function
  const closeToast = useCallback(() => {
    setToast(null);
  }, []);

  // Handle search input change
  const handleSearchChange = useCallback(
    (event: React.ChangeEvent<HTMLInputElement>) => {
      setSearchQuery(event.target.value);
    },
    [],
  );

  // Handle search input key down
  const handleSearchKeyDown = useCallback(
    (event: React.KeyboardEvent<HTMLInputElement>) => {
      if (event.key === "Escape") {
        clearSearch();
      }
    },
    [clearSearch],
  );

  // Load commands on mount
  useEffect(() => {
    loadCommands();
  }, [loadCommands]);

  // Search when debounced query changes
  useEffect(() => {
    searchCommands(debouncedSearchQuery);
  }, [debouncedSearchQuery, searchCommands]);

  // Memoized filtered commands for performance
  const displayCommands = useMemo(() => commands, [commands]);

  // Memoized command cards to prevent unnecessary re-renders
  const commandCards = useMemo(
    () =>
      displayCommands.map((command) => (
        <CommandCard
          key={`${command.timestamp}-${command.command}`}
          command={command}
          onCopy={copyCommand}
          searchQuery={debouncedSearchQuery}
        />
      )),
    [displayCommands, copyCommand, debouncedSearchQuery],
  );

  return (
    <div className="command-history">
      <header className="command-history-header">
        <div className="header-content">
          <h1 className="page-title">Command History</h1>
          <p className="page-description">
            Browse and search through your Claude Code CLI command history
          </p>
        </div>

        <div className="header-actions">
          <div className="search-container">
            <label htmlFor="command-search" className="search-label">
              Search commands
            </label>
            <div className="search-input-wrapper">
              <input
                ref={searchInputRef}
                id="command-search"
                type="search"
                className="search-input"
                placeholder="Search commands..."
                value={searchQuery}
                onChange={handleSearchChange}
                onKeyDown={handleSearchKeyDown}
                aria-describedby="search-help"
                autoCapitalize="off"
                autoComplete="off"
                spellCheck="false"
              />
              <div id="search-help" className="search-help">
                Press Escape to clear search
              </div>
              {searchQuery && (
                <button
                  type="button"
                  className="search-clear"
                  onClick={clearSearch}
                  aria-label="Clear search"
                  title="Clear search"
                >
                  ×
                </button>
              )}
            </div>
          </div>

          <div className="action-buttons">
            <button
              type="button"
              className="button button--secondary"
              onClick={loadCommands}
              disabled={loading}
              aria-label="Refresh command history"
            >
              <svg
                width="16"
                height="16"
                viewBox="0 0 16 16"
                fill="currentColor"
                aria-hidden="true"
              >
                <path d="M11.534 7h3.932a.25.25 0 0 1 .192.41l-1.966 2.36a.25.25 0 0 1-.384 0l-1.966-2.36a.25.25 0 0 1 .192-.41zm-11 2h3.932a.25.25 0 0 0 .192-.41L2.692 6.23a.25.25 0 0 0-.384 0L.342 8.59A.25.25 0 0 0 .534 9z" />
                <path
                  fillRule="evenodd"
                  d="M8 3c-1.552 0-2.94.707-3.857 1.818a.5.5 0 1 1-.771-.636A6.002 6.002 0 0 1 13.917 7H12.9A5.002 5.002 0 0 0 8 3zM3.1 9a5.002 5.002 0 0 0 8.757 2.182.5.5 0 1 1 .771.636A6.002 6.002 0 0 1 2.083 9H3.1z"
                />
              </svg>
              Refresh
            </button>

            <button
              type="button"
              className="button button--primary"
              onClick={exportCommands}
              disabled={loading || commands.length === 0 || isExporting}
              aria-label="Export command history"
            >
              <svg
                width="16"
                height="16"
                viewBox="0 0 16 16"
                fill="currentColor"
                aria-hidden="true"
              >
                <path d="M.5 9.9a.5.5 0 0 1 .5.5v2.5a1 1 0 0 0 1 1h12a1 1 0 0 0 1-1v-2.5a.5.5 0 0 1 1 0v2.5a2 2 0 0 1-2 2H2a2 2 0 0 1-2-2v-2.5a.5.5 0 0 1 .5-.5z" />
                <path d="M7.646 1.146a.5.5 0 0 1 .708 0l3 3a.5.5 0 0 1-.708.708L8.5 2.707V11.5a.5.5 0 0 1-1 0V2.707L5.354 4.854a.5.5 0 1 1-.708-.708l3-3z" />
              </svg>
              {isExporting ? "Exporting..." : "Export"}
            </button>
          </div>
        </div>
      </header>

      <main className="command-history-content">
        {loading && (
          <div className="commands-loading" aria-label="Loading commands">
            {Array.from({ length: 5 }, (_, i) => (
              <CommandSkeleton key={i} />
            ))}
          </div>
        )}

        {error && !loading && (
          <ErrorState error={error} onRetry={loadCommands} />
        )}

        {!loading && !error && commands.length === 0 && (
          <EmptyState
            hasSearch={!!debouncedSearchQuery.trim()}
            onClear={debouncedSearchQuery.trim() ? clearSearch : undefined}
          />
        )}

        {!loading && !error && commands.length > 0 && (
          <>
            <div className="commands-meta">
              <span className="commands-count" aria-live="polite">
                {commands.length} command{commands.length !== 1 ? "s" : ""}{" "}
                found
                {debouncedSearchQuery.trim() &&
                  ` for "${debouncedSearchQuery}"`}
              </span>
            </div>

            <div
              className="commands-list"
              role="feed"
              aria-label="Command history entries"
            >
              {commandCards}
            </div>
          </>
        )}
      </main>

      {toast && (
        <Toast message={toast.message} type={toast.type} onClose={closeToast} />
      )}

      <style>{`
        .command-history {
          display: flex;
          flex-direction: column;
          height: 100vh;
          background-color: var(--color-gray-50);
          font-family: var(--font-family-sans);
        }

        .command-history-header {
          background: white;
          border-bottom: 1px solid var(--color-gray-200);
          padding: var(--spacing-6);
          box-shadow: var(--elevation-1);
        }

        .header-content {
          margin-bottom: var(--spacing-6);
        }

        .page-title {
          font-size: calc(var(--font-size-base) * 1.5);
          font-weight: 600;
          color: var(--color-gray-900);
          margin: 0 0 var(--spacing-2) 0;
          line-height: 1.2;
        }

        .page-description {
          color: var(--color-gray-600);
          margin: 0;
          font-size: var(--font-size-sm);
        }

        .header-actions {
          display: flex;
          gap: var(--spacing-4);
          align-items: flex-start;
          flex-wrap: wrap;
        }

        .search-container {
          flex: 1;
          min-width: 300px;
        }

        .search-label {
          display: block;
          font-size: var(--font-size-sm);
          font-weight: 500;
          color: var(--color-gray-700);
          margin-bottom: var(--spacing-2);
        }

        .search-input-wrapper {
          position: relative;
        }

        .search-input {
          width: 100%;
          padding: var(--spacing-3) var(--spacing-4);
          border: 1px solid var(--color-gray-300);
          border-radius: var(--radius-base);
          font-size: var(--font-size-sm);
          font-family: var(--font-family-sans);
          transition: var(--transition-fast);
          background: white;
        }

        .search-input:focus {
          outline: none;
          border-color: var(--color-primary-500);
          box-shadow: 0 0 0 3px var(--color-primary-100);
        }

        .search-input:focus-visible {
          outline: 2px solid var(--color-primary-500);
          outline-offset: 2px;
        }

        .search-help {
          font-size: 12px;
          color: var(--color-gray-500);
          margin-top: var(--spacing-1);
        }

        .search-clear {
          position: absolute;
          right: var(--spacing-2);
          top: 50%;
          transform: translateY(-50%);
          background: none;
          border: none;
          color: var(--color-gray-400);
          cursor: pointer;
          padding: var(--spacing-1);
          border-radius: var(--radius-base);
          font-size: 18px;
          line-height: 1;
          transition: var(--transition-fast);
        }

        .search-clear:hover {
          color: var(--color-gray-600);
          background-color: var(--color-gray-100);
        }

        .search-clear:focus-visible {
          outline: 2px solid var(--color-primary-500);
          outline-offset: 2px;
        }

        .action-buttons {
          display: flex;
          gap: var(--spacing-3);
          align-items: flex-end;
        }

        .button {
          display: inline-flex;
          align-items: center;
          gap: var(--spacing-2);
          padding: var(--spacing-3) var(--spacing-4);
          border: 1px solid transparent;
          border-radius: var(--radius-base);
          font-size: var(--font-size-sm);
          font-weight: 500;
          cursor: pointer;
          transition: var(--transition-fast);
          text-decoration: none;
          white-space: nowrap;
        }

        .button:disabled {
          opacity: 0.6;
          cursor: not-allowed;
        }

        .button--primary {
          background-color: var(--color-primary-600);
          color: white;
        }

        .button--primary:hover:not(:disabled) {
          background-color: var(--color-primary-700);
        }

        .button--primary:focus-visible {
          outline: 2px solid var(--color-primary-500);
          outline-offset: 2px;
        }

        .button--secondary {
          background-color: white;
          color: var(--color-gray-700);
          border-color: var(--color-gray-300);
        }

        .button--secondary:hover:not(:disabled) {
          background-color: var(--color-gray-50);
          border-color: var(--color-gray-400);
        }

        .button--secondary:focus-visible {
          outline: 2px solid var(--color-primary-500);
          outline-offset: 2px;
        }

        .command-history-content {
          flex: 1;
          overflow: auto;
          padding: var(--spacing-6);
        }

        .commands-loading {
          display: flex;
          flex-direction: column;
          gap: var(--spacing-4);
        }

        .command-card {
          background: white;
          border: 1px solid var(--color-gray-200);
          border-radius: var(--radius-lg);
          padding: var(--spacing-5);
          margin-bottom: var(--spacing-4);
          box-shadow: var(--elevation-1);
          transition: var(--transition-base);
        }

        .command-card:hover {
          box-shadow: var(--elevation-2);
          border-color: var(--color-gray-300);
        }

        .command-card:focus-within {
          box-shadow: var(--elevation-2);
          border-color: var(--color-primary-300);
        }

        .command-card-header {
          display: flex;
          justify-content: space-between;
          align-items: flex-start;
          margin-bottom: var(--spacing-4);
          gap: var(--spacing-3);
        }

        .command-meta {
          display: flex;
          flex-direction: column;
          gap: var(--spacing-1);
        }

        .command-timestamp {
          font-size: var(--font-size-sm);
          color: var(--color-gray-600);
          font-family: var(--font-family-mono);
        }

        .command-user {
          font-size: var(--font-size-sm);
          color: var(--color-gray-500);
          font-weight: 500;
        }

        .copy-button {
          display: inline-flex;
          align-items: center;
          gap: var(--spacing-2);
          padding: var(--spacing-2) var(--spacing-3);
          background: var(--color-gray-100);
          border: 1px solid var(--color-gray-200);
          border-radius: var(--radius-base);
          color: var(--color-gray-700);
          font-size: var(--font-size-sm);
          cursor: pointer;
          transition: var(--transition-fast);
          flex-shrink: 0;
        }

        .copy-button:hover {
          background: var(--color-gray-200);
          border-color: var(--color-gray-300);
        }

        .copy-button:focus-visible {
          outline: 2px solid var(--color-primary-500);
          outline-offset: 2px;
        }

        .command-card-content {
          display: flex;
          flex-direction: column;
          gap: var(--spacing-3);
        }

        .command-text {
          font-family: var(--font-family-mono);
          font-size: var(--font-size-sm);
          line-height: 1.5;
          color: var(--color-gray-900);
          background: var(--color-gray-50);
          padding: var(--spacing-3);
          border-radius: var(--radius-base);
          border: 1px solid var(--color-gray-200);
          word-break: break-all;
          overflow-wrap: break-word;
        }

        .command-code {
          display: block;
          font-family: inherit;
          font-size: inherit;
          line-height: inherit;
          color: inherit;
          background: none;
        }

        .command-text :global(.command-highlight) {
          background-color: var(--color-primary-100);
          color: var(--color-primary-900);
          padding: 0 2px;
          border-radius: 2px;
          font-weight: 500;
        }

        .command-cwd {
          display: flex;
          align-items: center;
          gap: var(--spacing-2);
          font-size: var(--font-size-sm);
          color: var(--color-gray-600);
        }

        .cwd-label {
          font-weight: 500;
        }

        .cwd-path {
          font-family: var(--font-family-mono);
          background: var(--color-gray-100);
          padding: 2px var(--spacing-2);
          border-radius: var(--radius-base);
          font-size: 12px;
        }

        .commands-meta {
          margin-bottom: var(--spacing-4);
        }

        .commands-count {
          font-size: var(--font-size-sm);
          color: var(--color-gray-600);
        }

        .commands-list {
          display: flex;
          flex-direction: column;
        }

        .skeleton {
          animation: pulse 2s cubic-bezier(0.4, 0, 0.6, 1) infinite;
        }

        .skeleton-text {
          height: 1em;
          background: var(--color-gray-200);
          border-radius: var(--radius-base);
          margin-bottom: var(--spacing-2);
        }

        .skeleton-text--xs { width: 60px; }
        .skeleton-text--sm { width: 120px; }
        .skeleton-text--md { width: 60%; }
        .skeleton-text--lg { width: 80%; }

        @keyframes pulse {
          0%, 100% { opacity: 1; }
          50% { opacity: 0.5; }
        }

        .empty-state,
        .error-state {
          display: flex;
          flex-direction: column;
          align-items: center;
          justify-content: center;
          text-align: center;
          padding: var(--spacing-12) var(--spacing-6);
          color: var(--color-gray-600);
        }

        .empty-state-icon,
        .error-state-icon {
          margin-bottom: var(--spacing-4);
          color: var(--color-gray-400);
        }

        .error-state-icon {
          color: var(--color-error-500);
        }

        .empty-state-title,
        .error-state-title {
          font-size: calc(var(--font-size-base) * 1.25);
          font-weight: 600;
          margin: 0 0 var(--spacing-2) 0;
          color: var(--color-gray-900);
        }

        .empty-state-description,
        .error-state-description {
          margin: 0 0 var(--spacing-4) 0;
          max-width: 400px;
          line-height: 1.5;
        }

        .toast {
          position: fixed;
          top: var(--spacing-6);
          right: var(--spacing-6);
          display: flex;
          align-items: center;
          gap: var(--spacing-3);
          padding: var(--spacing-4) var(--spacing-5);
          border-radius: var(--radius-lg);
          box-shadow: var(--elevation-3);
          font-size: var(--font-size-sm);
          font-weight: 500;
          z-index: 1000;
          animation: slideIn 0.3s ease-out;
        }

        .toast--success {
          background: var(--color-success-50);
          color: var(--color-success-800);
          border: 1px solid var(--color-success-200);
        }

        .toast--error {
          background: var(--color-error-50);
          color: var(--color-error-800);
          border: 1px solid var(--color-error-200);
        }

        .toast-message {
          flex: 1;
        }

        .toast-close {
          background: none;
          border: none;
          color: currentColor;
          cursor: pointer;
          padding: 0;
          font-size: 18px;
          line-height: 1;
          opacity: 0.7;
          transition: var(--transition-fast);
        }

        .toast-close:hover {
          opacity: 1;
        }

        .toast-close:focus-visible {
          outline: 2px solid currentColor;
          outline-offset: 2px;
        }

        @keyframes slideIn {
          from {
            transform: translateX(100%);
            opacity: 0;
          }
          to {
            transform: translateX(0);
            opacity: 1;
          }
        }

        @media (max-width: 768px) {
          .command-history-header {
            padding: var(--spacing-4);
          }

          .header-actions {
            flex-direction: column;
            align-items: stretch;
          }

          .search-container {
            min-width: unset;
          }

          .action-buttons {
            justify-content: stretch;
          }

          .button {
            flex: 1;
            justify-content: center;
          }

          .command-history-content {
            padding: var(--spacing-4);
          }

          .command-card {
            padding: var(--spacing-4);
          }

          .command-card-header {
            flex-direction: column;
            align-items: flex-start;
            gap: var(--spacing-3);
          }

          .copy-button {
            align-self: flex-end;
          }

          .toast {
            left: var(--spacing-4);
            right: var(--spacing-4);
            top: var(--spacing-4);
          }
        }

        /* High contrast mode support */
        @media (prefers-contrast: high) {
          .command-card {
            border-width: 2px;
          }

          .search-input:focus {
            border-width: 2px;
          }

          .button {
            border-width: 2px;
          }
        }

        /* Reduced motion support */
        @media (prefers-reduced-motion: reduce) {
          * {
            animation-duration: 0.01ms !important;
            animation-iteration-count: 1 !important;
            transition-duration: 0.01ms !important;
          }
        }
      `}</style>
    </div>
  );
};

export default React.memo(CommandHistory);
