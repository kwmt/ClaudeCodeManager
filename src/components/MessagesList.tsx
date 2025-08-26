import React, { useEffect, useState, useRef, useCallback } from "react";
import { marked } from "marked";
import { formatDateTime, formatDateTooltip } from "../utils/dateUtils";
import type { ClaudeMessage, ContentBlock } from "../types";
import { useScrollPosition } from "../hooks/useScrollPosition";

interface MessagesListProps {
  messages: ClaudeMessage[];
  loading: boolean;
  searchQuery: string;
  messageTypeFilter: string;
  renderAsMarkdown: boolean;
  onMessageClick?: (messageId: string) => void;
  initialScrollToMessage?: string;
}

interface MessageDiff {
  type: "added" | "updated" | "removed" | "unchanged";
  messageId: string;
  message: ClaudeMessage;
  previousMessage?: ClaudeMessage;
}

interface MessageAnimationState {
  messageId: string;
  animationType: "fade-in" | "highlight" | "fade-out" | "pulse";
  duration: number;
}

export const MessagesList: React.FC<MessagesListProps> = ({
  messages,
  loading,
  searchQuery,
  messageTypeFilter,
  renderAsMarkdown,
  onMessageClick,
  initialScrollToMessage,
}) => {
  const messageListRef = useRef<HTMLDivElement>(null);
  const [previousMessages, setPreviousMessages] = useState<ClaudeMessage[]>([]);
  const [filteredMessages, setFilteredMessages] = useState<ClaudeMessage[]>([]);
  const [animationStates, setAnimationStates] = useState<
    Map<string, MessageAnimationState>
  >(new Map());

  // Custom hook for scroll position management
  const { saveScrollPosition, restoreScrollPosition } =
    useScrollPosition(messageListRef);

  // Generate unique message ID
  const getMessageId = useCallback(
    (message: ClaudeMessage, index: number): string => {
      if (message.message_type === "summary") {
        return `summary-${index}`;
      }
      if ("uuid" in message) {
        return message.uuid;
      }
      return `message-${index}`;
    },
    [],
  );

  // Extract text content from message
  const getMessageTextContent = useCallback(
    (message: ClaudeMessage): string => {
      if (message.message_type === "summary") {
        return (message as any).summary || "";
      }

      if (!("content" in message)) {
        return "";
      }

      const content = message.content.content;

      if (typeof content === "string") {
        return content;
      }

      if (Array.isArray(content)) {
        return content
          .map((block) => {
            if (block.type === "text") {
              return block.text;
            }
            if (block.type === "tool_use") {
              return `${block.name}: ${JSON.stringify(block.input)}`;
            }
            return "";
          })
          .join(" ");
      }

      return "";
    },
    [],
  );

  // Calculate message differences for efficient updates
  const calculateMessageDiffs = useCallback(
    (
      newMessages: ClaudeMessage[],
      oldMessages: ClaudeMessage[],
    ): MessageDiff[] => {
      const diffs: MessageDiff[] = [];
      const oldMessagesMap = new Map<string, ClaudeMessage>();

      // Create lookup map for old messages
      oldMessages.forEach((msg, index) => {
        const id = getMessageId(msg, index);
        oldMessagesMap.set(id, msg);
      });

      // Check for new and updated messages
      newMessages.forEach((msg, index) => {
        const id = getMessageId(msg, index);
        const oldMessage = oldMessagesMap.get(id);

        if (!oldMessage) {
          diffs.push({
            type: "added",
            messageId: id,
            message: msg,
          });
        } else {
          // Check if message content or status has changed
          const hasChanged = JSON.stringify(msg) !== JSON.stringify(oldMessage);
          diffs.push({
            type: hasChanged ? "updated" : "unchanged",
            messageId: id,
            message: msg,
            previousMessage: oldMessage,
          });
        }
      });

      // Check for removed messages
      oldMessages.forEach((msg, index) => {
        const id = getMessageId(msg, index);
        const stillExists = newMessages.some(
          (newMsg, newIndex) => getMessageId(newMsg, newIndex) === id,
        );

        if (!stillExists) {
          diffs.push({
            type: "removed",
            messageId: id,
            message: msg,
          });
        }
      });

      return diffs;
    },
    [getMessageId],
  );

  // Apply visual animations based on message changes
  const applyMessageAnimations = useCallback((diffs: MessageDiff[]) => {
    const newAnimationStates = new Map<string, MessageAnimationState>();

    diffs.forEach((diff) => {
      switch (diff.type) {
        case "added":
          newAnimationStates.set(diff.messageId, {
            messageId: diff.messageId,
            animationType: "fade-in",
            duration: 500,
          });
          break;
        case "updated":
          // Only animate if there's a meaningful change
          if (
            diff.previousMessage &&
            "processing_status" in diff.message &&
            "processing_status" in diff.previousMessage &&
            diff.message.processing_status !==
              diff.previousMessage.processing_status
          ) {
            newAnimationStates.set(diff.messageId, {
              messageId: diff.messageId,
              animationType: "pulse",
              duration: 800,
            });
          } else if (diff.previousMessage) {
            newAnimationStates.set(diff.messageId, {
              messageId: diff.messageId,
              animationType: "highlight",
              duration: 1200,
            });
          }
          break;
        case "removed":
          newAnimationStates.set(diff.messageId, {
            messageId: diff.messageId,
            animationType: "fade-out",
            duration: 300,
          });
          break;
      }
    });

    if (newAnimationStates.size > 0) {
      setAnimationStates(newAnimationStates);

      // Clear animations after they complete
      const timeoutId = setTimeout(
        () => {
          setAnimationStates(new Map());
        },
        Math.max(
          ...Array.from(newAnimationStates.values()).map(
            (state) => state.duration,
          ),
        ),
      );

      // Cleanup timeout on unmount
      return () => clearTimeout(timeoutId);
    }
  }, []);

  // Process message updates with diffing
  useEffect(() => {
    if (messages.length === 0) {
      setFilteredMessages([]);
      setPreviousMessages([]);
      return;
    }

    // Save current scroll position before processing updates
    saveScrollPosition();

    // Calculate differences from previous state
    const diffs = calculateMessageDiffs(messages, previousMessages);

    // Apply visual animations for changes
    applyMessageAnimations(diffs);

    // Update previous messages state
    setPreviousMessages(messages);

    // Process filtering
    let filtered = messages;

    // Filter by message type
    if (messageTypeFilter !== "all") {
      filtered = filtered.filter(
        (message) => message.message_type === messageTypeFilter,
      );
    }

    // Filter by search query
    if (searchQuery.trim()) {
      const query = searchQuery.toLowerCase();
      filtered = filtered.filter((message) => {
        // Search in content
        const content = getMessageTextContent(message);
        if (content.toLowerCase().includes(query)) return true;

        // Search in UUID
        if (
          message.message_type !== "summary" &&
          "uuid" in message &&
          message.uuid.toLowerCase().includes(query)
        )
          return true;

        // Search in timestamp
        if (
          message.message_type !== "summary" &&
          "timestamp" in message &&
          formatDateTime(message.timestamp, { style: "technical" })
            .toLowerCase()
            .includes(query)
        )
          return true;

        return false;
      });
    }

    setFilteredMessages(filtered);

    // Restore scroll position after DOM updates
    requestAnimationFrame(() => {
      restoreScrollPosition();
    });
  }, [
    messages,
    messageTypeFilter,
    searchQuery,
    calculateMessageDiffs,
    applyMessageAnimations,
    getMessageTextContent,
    saveScrollPosition,
    restoreScrollPosition,
  ]);

  // Handle initial scroll to specific message
  useEffect(() => {
    if (initialScrollToMessage && filteredMessages.length > 0) {
      const timeoutId = setTimeout(() => {
        const messageElement = document.getElementById(
          `message-${initialScrollToMessage}`,
        );
        if (messageElement && messageListRef.current) {
          messageElement.scrollIntoView({
            behavior: "smooth",
            block: "center",
          });
          // Add highlight animation
          setAnimationStates(
            (prev) =>
              new Map(
                prev.set(initialScrollToMessage, {
                  messageId: initialScrollToMessage,
                  animationType: "highlight",
                  duration: 2000,
                }),
              ),
          );
        }
      }, 150);

      // Cleanup timeout on unmount
      return () => clearTimeout(timeoutId);
    }
  }, [initialScrollToMessage, filteredMessages.length]);

  // Scroll to specific message
  const scrollToMessage = useCallback(
    (messageId: string) => {
      const messageElement = document.getElementById(`message-${messageId}`);
      if (messageElement && messageListRef.current) {
        messageElement.scrollIntoView({ behavior: "smooth", block: "center" });

        // Add highlight animation
        setAnimationStates(
          (prev) =>
            new Map(
              prev.set(messageId, {
                messageId,
                animationType: "highlight",
                duration: 2000,
              }),
            ),
        );
      }

      onMessageClick?.(messageId);
    },
    [onMessageClick],
  );

  // Render text with optional markdown
  const renderText = useCallback(
    (text: string, isMarkdown: boolean = false): JSX.Element => {
      if (isMarkdown && renderAsMarkdown) {
        return (
          <div
            className="markdown-content"
            dangerouslySetInnerHTML={{
              __html: (() => {
                try {
                  const result = marked(text);
                  return typeof result === "string" ? result : "";
                } catch {
                  return "";
                }
              })(),
            }}
          />
        );
      }
      return <pre className="content-text word-wrap">{text}</pre>;
    },
    [renderAsMarkdown],
  );

  // Generate diff for Edit tools
  const generateDiff = useCallback(
    (oldString: string, newString: string, filePath?: string) => {
      const oldLines = oldString.split("\n");
      const newLines = newString.split("\n");

      // Simple diff algorithm - find common prefix and suffix
      let commonPrefixLength = 0;
      const minLength = Math.min(oldLines.length, newLines.length);

      // Find common prefix
      while (
        commonPrefixLength < minLength &&
        oldLines[commonPrefixLength] === newLines[commonPrefixLength]
      ) {
        commonPrefixLength++;
      }

      // Find common suffix
      let commonSuffixLength = 0;
      while (
        commonSuffixLength < minLength - commonPrefixLength &&
        oldLines[oldLines.length - 1 - commonSuffixLength] ===
          newLines[newLines.length - 1 - commonSuffixLength]
      ) {
        commonSuffixLength++;
      }

      // Calculate removed and added lines
      const removedStart = commonPrefixLength;
      const removedEnd = oldLines.length - commonSuffixLength;
      const addedStart = commonPrefixLength;
      const addedEnd = newLines.length - commonSuffixLength;

      const removedLines = oldLines.slice(removedStart, removedEnd);
      const addedLines = newLines.slice(addedStart, addedEnd);

      // Generate unified diff view
      const diffLines: Array<{
        type: "context" | "removed" | "added";
        oldLineNum?: number;
        newLineNum?: number;
        content: string;
      }> = [];

      // Add context before changes (up to 3 lines)
      const contextStart = Math.max(0, commonPrefixLength - 3);
      for (let i = contextStart; i < commonPrefixLength; i++) {
        diffLines.push({
          type: "context",
          oldLineNum: i + 1,
          newLineNum: i + 1,
          content: oldLines[i],
        });
      }

      // Add removed lines
      for (let i = 0; i < removedLines.length; i++) {
        diffLines.push({
          type: "removed",
          oldLineNum: removedStart + i + 1,
          content: removedLines[i],
        });
      }

      // Add added lines
      for (let i = 0; i < addedLines.length; i++) {
        diffLines.push({
          type: "added",
          newLineNum: addedStart + i + 1,
          content: addedLines[i],
        });
      }

      // Add context after changes (up to 3 lines)
      const contextEndStart = oldLines.length - commonSuffixLength;
      const contextEndLimit = Math.min(contextEndStart + 3, oldLines.length);
      for (let i = contextEndStart; i < contextEndLimit; i++) {
        const newLineIndex = i - (oldLines.length - newLines.length);
        diffLines.push({
          type: "context",
          oldLineNum: i + 1,
          newLineNum: newLineIndex + 1,
          content: oldLines[i],
        });
      }

      return {
        filePath: filePath || "Unknown file",
        additions: addedLines.length,
        deletions: removedLines.length,
        diffLines,
      };
    },
    [],
  );

  // Render content block
  const renderContentBlock = useCallback(
    (block: ContentBlock, index: number) => {
      if (block.type === "text") {
        const text = block.text;

        // Check if text looks like markdown
        const looksLikeMarkdown =
          /#{1,6}\s|\*\s|-\s|```|\d+\.\s|\*\*[^*]+\*\*|\*[^*]+\*|`[^`]+`|\[.*\]\(.*\)/m.test(
            text,
          );

        return (
          <div key={index} className="text-block">
            {renderText(text, looksLikeMarkdown)}
          </div>
        );
      }

      if (block.type === "tool_use") {
        // Handle Edit tool with old_string/new_string
        if (
          block.name === "Edit" &&
          block.input.old_string &&
          block.input.new_string
        ) {
          const diff = generateDiff(
            block.input.old_string,
            block.input.new_string,
            block.input.file_path,
          );

          return (
            <div key={index} className="tool-use-block diff-view">
              <div className="tool-header">
                <span className="tool-icon">⏺</span>
                <span className="tool-name">Update({diff.filePath})</span>
              </div>
              <div className="diff-summary">
                ⎿ Updated {diff.filePath} with {diff.additions} addition
                {diff.additions !== 1 ? "s" : ""} and {diff.deletions} removal
                {diff.deletions !== 1 ? "s" : ""}
              </div>
              <div className="diff-content unified-diff">
                {diff.diffLines.map((line, lineIndex) => (
                  <div
                    key={lineIndex}
                    className={`diff-line diff-line-${line.type}`}
                  >
                    <span className="line-numbers">
                      <span className="old-line-num">
                        {line.oldLineNum || ""}
                      </span>
                      <span className="new-line-num">
                        {line.newLineNum || ""}
                      </span>
                    </span>
                    <span className="diff-marker">
                      {line.type === "removed"
                        ? "-"
                        : line.type === "added"
                          ? "+"
                          : " "}
                    </span>
                    <pre className="diff-line-content">{line.content}</pre>
                  </div>
                ))}
              </div>
            </div>
          );
        }

        // Handle MultiEdit tool
        if (
          block.name === "MultiEdit" &&
          block.input.edits &&
          Array.isArray(block.input.edits)
        ) {
          const totalAdditions = block.input.edits.reduce(
            (sum: number, edit: any) => {
              const diff = generateDiff(
                edit.old_string || "",
                edit.new_string || "",
              );
              return sum + diff.additions;
            },
            0,
          );

          const totalDeletions = block.input.edits.reduce(
            (sum: number, edit: any) => {
              const diff = generateDiff(
                edit.old_string || "",
                edit.new_string || "",
              );
              return sum + diff.deletions;
            },
            0,
          );

          return (
            <div key={index} className="tool-use-block diff-view">
              <div className="tool-header">
                <span className="tool-icon">⏺</span>
                <span className="tool-name">
                  MultiEdit({block.input.file_path || "Unknown file"})
                </span>
              </div>
              <div className="diff-summary">
                ⎿ Updated {block.input.file_path || "file"} with{" "}
                {totalAdditions} total addition{totalAdditions !== 1 ? "s" : ""}{" "}
                and {totalDeletions} total removal
                {totalDeletions !== 1 ? "s" : ""} across{" "}
                {block.input.edits.length} edit
                {block.input.edits.length !== 1 ? "s" : ""}
              </div>
              {block.input.edits.map((edit: any, editIndex: number) => {
                const diff = generateDiff(
                  edit.old_string || "",
                  edit.new_string || "",
                  block.input.file_path,
                );
                return (
                  <div key={editIndex} className="multi-edit-section">
                    <div className="diff-edit-number">
                      Edit {editIndex + 1} ({diff.additions} addition
                      {diff.additions !== 1 ? "s" : ""}, {diff.deletions}{" "}
                      removal
                      {diff.deletions !== 1 ? "s" : ""})
                    </div>
                    <div className="diff-content unified-diff">
                      {diff.diffLines.map((line, lineIndex) => (
                        <div
                          key={lineIndex}
                          className={`diff-line diff-line-${line.type}`}
                        >
                          <span className="line-numbers">
                            <span className="old-line-num">
                              {line.oldLineNum || ""}
                            </span>
                            <span className="new-line-num">
                              {line.newLineNum || ""}
                            </span>
                          </span>
                          <span className="diff-marker">
                            {line.type === "removed"
                              ? "-"
                              : line.type === "added"
                                ? "+"
                                : " "}
                          </span>
                          <pre className="diff-line-content">
                            {line.content}
                          </pre>
                        </div>
                      ))}
                    </div>
                  </div>
                );
              })}
            </div>
          );
        }

        // Default tool_use rendering
        return (
          <div key={index} className="tool-use-block">
            <div className="tool-header">
              <span className="tool-icon">🛠️</span>
              <span className="tool-name">{block.name}</span>
            </div>
            <div className="tool-input">
              <pre className="word-wrap">
                {JSON.stringify(block.input, null, 2)}
              </pre>
            </div>
          </div>
        );
      }

      return null;
    },
    [renderText, generateDiff],
  );

  // Render message content
  const renderMessageContent = useCallback(
    (message: ClaudeMessage) => {
      if (message.message_type === "user") {
        if (!("content" in message)) {
          return null;
        }
        const userContent = message.content.content;

        if (typeof userContent === "string") {
          // Command message special handling
          if (
            userContent.includes("<command-name>") &&
            userContent.includes("</command-name>")
          ) {
            const commandMatch = userContent.match(
              /<command-name>([^<]+)<\/command-name>/,
            );
            const messageMatch = userContent.match(
              /<command-message>([^<]*)<\/command-message>/,
            );
            const argsMatch = userContent.match(
              /<command-args>([^<]*)<\/command-args>/,
            );

            return (
              <div className="message-content user-content command-content">
                <div className="command-info">
                  <span className="command-label">Command:</span>{" "}
                  {commandMatch?.[1] || "Unknown"}
                </div>
                {messageMatch?.[1] && (
                  <div className="command-message">{messageMatch[1]}</div>
                )}
                {argsMatch?.[1] && (
                  <div className="command-args">
                    <span className="args-label">Args:</span> {argsMatch[1]}
                  </div>
                )}
              </div>
            );
          }

          // Regular text message
          const looksLikeMarkdown =
            /#{1,6}\s|\*\s|-\s|```|\d+\.\s|\*\*[^*]+\*\*|\*[^*]+\*|`[^`]+`|\[.*\]\(.*\)/m.test(
              userContent,
            );
          return (
            <div className="message-content user-content">
              {renderText(userContent, looksLikeMarkdown)}
            </div>
          );
        } else if (Array.isArray(userContent)) {
          // ContentBlock[] case
          return (
            <div className="message-content user-content">
              {userContent.map((block: any, index: number) =>
                renderContentBlock(block, index),
              )}
            </div>
          );
        }
      }

      if (message.message_type === "assistant") {
        if (!("content" in message)) {
          return null;
        }
        const assistantContent = message.content.content;

        if (Array.isArray(assistantContent)) {
          return (
            <div className="message-content assistant-content">
              {assistantContent.map((block: any, index: number) =>
                renderContentBlock(block, index),
              )}
            </div>
          );
        }
      }

      if (message.message_type === "summary") {
        const summaryText = (message as any).summary || "";
        return (
          <div className="message-content summary-message-content">
            <div className="summary-message-header">
              <span className="summary-message-icon">📋</span>
              <span className="summary-message-label">Summary</span>
            </div>
            <div className="summary-message-text">{summaryText}</div>
          </div>
        );
      }

      return (
        <div className="message-content">
          <pre className="content-text">{JSON.stringify(message, null, 2)}</pre>
        </div>
      );
    },
    [renderText, renderContentBlock],
  );

  // Get animation class for message
  const getMessageAnimationClass = useCallback(
    (messageId: string): string => {
      const animationState = animationStates.get(messageId);
      if (!animationState) return "";

      return `message-animation message-animation-${animationState.animationType}`;
    },
    [animationStates],
  );

  if (loading) {
    return (
      <div className="loading" aria-live="polite">
        Loading messages...
      </div>
    );
  }

  if (filteredMessages.length === 0) {
    return (
      <div className="no-messages" role="status" aria-live="polite">
        {searchQuery || messageTypeFilter !== "all"
          ? "No messages match the current filters"
          : "No messages found"}
      </div>
    );
  }

  return (
    <div
      className="messages-list"
      ref={messageListRef}
      role="log"
      aria-label="Claude session messages"
      aria-live="polite"
    >
      {filteredMessages.map((message, index) => {
        const messageId = getMessageId(message, index);
        const animationClass = getMessageAnimationClass(messageId);

        return (
          <div
            key={messageId}
            id={`message-${messageId}`}
            className={`message ${message.message_type.toLowerCase()} ${animationClass}`}
            onClick={() => scrollToMessage(messageId)}
            role="article"
            aria-label={`${message.message_type} message`}
            tabIndex={0}
            onKeyDown={(e) => {
              if (e.key === "Enter" || e.key === " ") {
                e.preventDefault();
                scrollToMessage(messageId);
              }
            }}
          >
            <div className="message-header">
              <span className="message-type">
                {message.message_type}
                {message.message_type !== "summary" &&
                  "processing_status" in message && (
                    <span
                      className={`status-indicator status-${message.processing_status}`}
                      title={`Status: ${message.processing_status}${
                        message.message_type === "assistant" &&
                        "stop_reason" in message &&
                        message.stop_reason
                          ? ` (${message.stop_reason})`
                          : ""
                      }`}
                      aria-label={`Processing status: ${message.processing_status}`}
                    >
                      <span className="status-dot"></span>
                    </span>
                  )}
              </span>
              <span
                className="message-time"
                title={
                  message.message_type !== "summary" && "timestamp" in message
                    ? formatDateTooltip(message.timestamp)
                    : undefined
                }
              >
                {message.message_type === "summary"
                  ? ""
                  : "timestamp" in message
                    ? formatDateTime(message.timestamp, {
                        style: "technical",
                      })
                    : ""}
              </span>
            </div>
            {renderMessageContent(message)}
            {message.message_type !== "summary" &&
              "cwd" in message &&
              message.cwd && (
                <div className="message-meta">CWD: {message.cwd}</div>
              )}
          </div>
        );
      })}
    </div>
  );
};
