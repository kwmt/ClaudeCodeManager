import React, { useEffect, useState, useCallback, useMemo } from "react";
import { api } from "../api";
import type { CommandLogEntry } from "../types";
import { formatDateTime, formatDateTooltip } from "../utils/dateUtils";
import { VirtualizedCommandList } from "./VirtualizedCommandList";
import { useDebounce } from "../hooks/useDebounce";
import { ErrorBoundary, CommandHistoryErrorFallback } from "./ErrorBoundary";

interface CommandHistoryProps {}

export const CommandHistory: React.FC<CommandHistoryProps> = () => {
  const [commands, setCommands] = useState<CommandLogEntry[]>([]);
  const [searchQuery, setSearchQuery] = useState("");
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [copyFeedback, setCopyFeedback] = useState<number | null>(null);

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
      a.download = "command_history.json";
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
      <div className="command-history-error">
        <h3>Error</h3>
        <p>{error}</p>
        <button onClick={loadCommands}>Retry</button>
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
        // Could send to error reporting service here
      }}
    >
      <div className="command-history">
        <div className="command-history-header">
          <h2>Command History</h2>
          <div className="header-actions">
            <div className="search-container">
              <input
                type="text"
                placeholder="Search commands..."
                value={searchQuery}
                onChange={(e) => setSearchQuery(e.target.value)}
                className="search-input"
                aria-label="Search commands"
              />
            </div>
            <button onClick={exportCommands} className="export-button">
              Export All
            </button>
          </div>
        </div>

        <div className="command-history-content">
          {loading ? (
            <div className="loading" aria-live="polite">
              Loading command history...
            </div>
          ) : commands.length === 0 ? (
            <div className="no-commands" role="status">
              No commands found
            </div>
          ) : (
            <VirtualizedCommandList
              commands={commands}
              onCopyCommand={copyCommand}
              copyFeedback={copyFeedback}
            />
          )}
        </div>
      </div>
    </ErrorBoundary>
  );
};
