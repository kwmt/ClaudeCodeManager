import React, { useState, useCallback, useMemo } from "react";
import DOMPurify from "isomorphic-dompurify";
import type { CommandLogEntry } from "../types";
import { formatDateTime, formatDateTooltip } from "../utils/dateUtils";

interface VirtualizedCommandListProps {
  commands: CommandLogEntry[];
  onCopyCommand: (command: string, index: number) => void;
  copyFeedback: number | null;
}

interface CommandItemProps {
  cmd: CommandLogEntry;
  index: number;
  onCopyCommand: (command: string, index: number) => void;
  copyFeedback: number | null;
  isExpanded: boolean;
  onToggleExpansion: (index: number) => void;
}

const CommandItem: React.FC<CommandItemProps> = React.memo(
  ({
    cmd,
    index,
    onCopyCommand,
    copyFeedback,
    isExpanded,
    onToggleExpansion,
  }) => {
    const handleKeyDown = useCallback(
      (e: React.KeyboardEvent) => {
        switch (e.key) {
          case "Enter":
          case " ":
            e.preventDefault();
            onToggleExpansion(index);
            break;
          case "c":
            if (e.ctrlKey || e.metaKey) {
              e.preventDefault();
              onCopyCommand(cmd.command, index);
            }
            break;
          case "ArrowDown":
            e.preventDefault();
            const nextItem = e.currentTarget.nextElementSibling as HTMLElement;
            if (nextItem) {
              nextItem.focus();
            }
            break;
          case "ArrowUp":
            e.preventDefault();
            const prevItem = e.currentTarget
              .previousElementSibling as HTMLElement;
            if (prevItem) {
              prevItem.focus();
            }
            break;
          case "Home":
            e.preventDefault();
            const firstItem = e.currentTarget.parentElement
              ?.firstElementChild as HTMLElement;
            if (firstItem && firstItem !== e.currentTarget) {
              firstItem.focus();
            }
            break;
          case "End":
            e.preventDefault();
            const lastItem = e.currentTarget.parentElement
              ?.lastElementChild as HTMLElement;
            if (lastItem && lastItem !== e.currentTarget) {
              lastItem.focus();
            }
            break;
        }
      },
      [cmd.command, index, onToggleExpansion, onCopyCommand],
    );
    const isCommandLong = useCallback((command: string) => {
      return command.length > 80 || command.includes("\n");
    }, []);

    const truncateCommand = useCallback(
      (command: string, maxLength: number = 80) => {
        if (command.length <= maxLength) return command;
        return command.substring(0, maxLength) + "...";
      },
      [],
    );

    const isLong = isCommandLong(cmd.command);
    const displayCommand =
      isExpanded || !isLong ? cmd.command : truncateCommand(cmd.command);

    // Sanitize command text to prevent XSS attacks
    const sanitizedCommand = useMemo(() => {
      return DOMPurify.sanitize(displayCommand, {
        ALLOWED_TAGS: [],
        ALLOWED_ATTR: [],
      });
    }, [displayCommand]);

    return (
      <article
        className="command-item"
        aria-labelledby={`command-${index}-header`}
        aria-describedby={`command-${index}-text ${cmd.cwd ? `command-${index}-cwd` : ""}`}
        tabIndex={0}
        onKeyDown={handleKeyDown}
        role="listitem"
        aria-posinset={index + 1}
        aria-setsize={-1} // Will be set by parent
      >
        <header className="command-header" id={`command-${index}-header`}>
          <div className="command-meta">
            <span className="command-user" aria-label="User">
              {cmd.user}
            </span>
            <time
              className="command-time"
              dateTime={cmd.timestamp}
              title={formatDateTooltip(cmd.timestamp)}
              aria-label={`Executed at ${formatDateTooltip(cmd.timestamp)}`}
            >
              {formatDateTime(cmd.timestamp, { style: "technical" })}
            </time>
          </div>
          <div className="command-actions">
            {isLong && (
              <button
                className="expand-button"
                onClick={() => onToggleExpansion(index)}
                aria-expanded={isExpanded}
                aria-controls={`command-${index}-text`}
                title={isExpanded ? "Collapse command" : "Expand command"}
              >
                {isExpanded ? "▼" : "▶"}
              </button>
            )}
            <button
              className={`copy-button ${copyFeedback === index ? "copied" : ""}`}
              onClick={() => onCopyCommand(cmd.command, index)}
              title="Copy command to clipboard"
              aria-label="Copy command to clipboard"
            >
              {copyFeedback === index ? "✓" : "📋"}
            </button>
          </div>
        </header>
        <div
          className={`command-text ${isExpanded ? "expanded" : ""}`}
          id={`command-${index}-text`}
          aria-label="Command text"
        >
          <pre>
            <code>{sanitizedCommand}</code>
          </pre>
        </div>
        {cmd.cwd && (
          <div
            className="command-cwd"
            id={`command-${index}-cwd`}
            aria-label="Working directory"
          >
            <span className="cwd-label">Working directory:</span>
            <span className="cwd-path">{cmd.cwd}</span>
          </div>
        )}
      </article>
    );
  },
);

CommandItem.displayName = "CommandItem";

export const VirtualizedCommandList: React.FC<VirtualizedCommandListProps> = ({
  commands,
  onCopyCommand,
  copyFeedback,
}) => {
  const [expandedCommands, setExpandedCommands] = useState<Set<number>>(
    new Set(),
  );
  // const [focusedIndex, setFocusedIndex] = useState<number>(-1);

  const toggleCommandExpansion = useCallback((index: number) => {
    setExpandedCommands((prev) => {
      const newSet = new Set(prev);
      if (newSet.has(index)) {
        newSet.delete(index);
      } else {
        newSet.add(index);
      }
      return newSet;
    });
  }, []);

  // Enhanced keyboard navigation (currently unused but kept for future implementation)
  /*
  const handleListKeyDown = useCallback(
    (e: React.KeyboardEvent) => {
      switch (e.key) {
        case "ArrowDown":
          e.preventDefault();
          setFocusedIndex((prev) => Math.min(prev + 1, commands.length - 1));
          break;
        case "ArrowUp":
          e.preventDefault();
          setFocusedIndex((prev) => Math.max(prev - 1, 0));
          break;
        case "Home":
          e.preventDefault();
          setFocusedIndex(0);
          break;
        case "End":
          e.preventDefault();
          setFocusedIndex(commands.length - 1);
          break;
        case "Enter":
        case " ":
          e.preventDefault();
          if (focusedIndex >= 0) {
            toggleCommandExpansion(focusedIndex);
          }
          break;
      }
    },
    [commands.length, focusedIndex, toggleCommandExpansion],
  );
  */

  // Auto-focus management (disabled for now)
  /*
  React.useEffect(() => {
    if (focusedIndex >= 0) {
      const element = document.querySelector(
        `[data-command-index="${focusedIndex}"]`,
      ) as HTMLElement;
      if (element) {
        element.focus();
      }
    }
  }, [focusedIndex]);
  */

  // For large datasets, we could implement virtual scrolling here
  // For now, we'll optimize rendering with React.memo and proper key usage
  const renderedCommands = useMemo(() => {
    return commands.map((cmd, index) => (
      <CommandItem
        key={`${cmd.timestamp}-${index}`} // Better key for stability
        cmd={cmd}
        index={index}
        onCopyCommand={onCopyCommand}
        copyFeedback={copyFeedback}
        isExpanded={expandedCommands.has(index)}
        onToggleExpansion={toggleCommandExpansion}
      />
    ));
  }, [
    commands,
    copyFeedback,
    expandedCommands,
    onCopyCommand,
    toggleCommandExpansion,
  ]);

  return (
    <div
      className="commands-list"
      role="list"
      aria-label={`Command history list containing ${commands.length} commands`}
      aria-live="polite"
      aria-describedby="command-list-instructions"
    >
      <div
        id="command-list-instructions"
        className="sr-only"
        aria-hidden="true"
      >
        Navigation: Use arrow keys to move between commands, Home/End to jump to
        first/last. Actions: Press Enter or Space to expand/collapse, Ctrl+C or
        Cmd+C to copy command.
      </div>
      {renderedCommands.map((command) =>
        React.cloneElement(command, {
          "aria-setsize": commands.length,
          key: command.key,
        }),
      )}
    </div>
  );
};
