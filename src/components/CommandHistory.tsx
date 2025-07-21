import React, { useEffect, useState } from "react";
import { api } from "../api";
import type { CommandLogEntry } from "../types";

interface CommandHistoryProps {}

export const CommandHistory: React.FC<CommandHistoryProps> = () => {
  const [commands, setCommands] = useState<CommandLogEntry[]>([]);
  const [searchQuery, setSearchQuery] = useState("");
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    loadCommands();
  }, []);

  useEffect(() => {
    if (searchQuery.trim()) {
      searchCommands();
    } else {
      loadCommands();
    }
  }, [searchQuery]);

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

  const copyCommand = async (command: string) => {
    try {
      await navigator.clipboard.writeText(command);
      // You might want to show a toast notification here
    } catch (err) {
      console.error("Failed to copy command:", err);
    }
  };

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
            />
          </div>
          <button onClick={exportCommands} className="export-button">
            Export All
          </button>
        </div>
      </div>

      <div className="command-history-content">
        {loading ? (
          <div className="loading">Loading command history...</div>
        ) : commands.length === 0 ? (
          <div className="no-commands">No commands found</div>
        ) : (
          <div className="commands-list">
            {commands.map((cmd, index) => (
              <div key={index} className="command-item">
                <div className="command-header">
                  <span className="command-user">{cmd.user}</span>
                  <span className="command-time">
                    {new Date(cmd.timestamp).toLocaleString()}
                  </span>
                  <button
                    className="copy-button"
                    onClick={() => copyCommand(cmd.command)}
                    title="Copy command"
                  >
                    📋
                  </button>
                </div>
                <div className="command-text">
                  <code>{cmd.command}</code>
                </div>
                {cmd.cwd && (
                  <div className="command-cwd">
                    Working directory: {cmd.cwd}
                  </div>
                )}
              </div>
            ))}
          </div>
        )}
      </div>
    </div>
  );
};
