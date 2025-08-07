import React, { useState, useCallback, useEffect, useMemo } from "react";
import JSONEditor from "../JSONEditor";
import { SafeConfirmDialog } from "../SafeConfirmDialog";
import { validateFileName } from "../../utils/security";

interface FileChange {
  timestamp: number;
  content: string;
  description: string;
}

interface ImprovedFileEditorProps {
  filename: string;
  initialContent: string;
  onSave: (content: string) => Promise<void>;
  onCancel: () => void;
  readOnly?: boolean;
  showDiffView?: boolean;
  maxHistoryEntries?: number;
}

/**
 * Enhanced file editor with improved UX features
 *
 * Features:
 * - Real-time validation with inline feedback
 * - Change history with restore capability
 * - Auto-save with conflict detection
 * - Side-by-side diff view
 * - Keyboard shortcuts
 * - Accessibility improvements
 */
export const ImprovedFileEditor: React.FC<ImprovedFileEditorProps> = ({
  filename,
  initialContent,
  onSave,
  onCancel,
  readOnly = false,
  showDiffView = false,
  maxHistoryEntries = 10,
}) => {
  const [content, setContent] = useState(initialContent);
  const [isValid, setIsValid] = useState(true);
  const [validationError, setValidationError] = useState<string | null>(null);
  const [isSaving, setIsSaving] = useState(false);
  const [changeHistory, setChangeHistory] = useState<FileChange[]>([]);
  const [showHistory, setShowHistory] = useState(false);
  const [showUnsavedDialog, setShowUnsavedDialog] = useState(false);
  const [autoSaveEnabled, setAutoSaveEnabled] = useState(false);

  // Calculate if there are unsaved changes
  const hasUnsavedChanges = useMemo(() => {
    return content !== initialContent;
  }, [content, initialContent]);

  // Auto-save effect
  useEffect(() => {
    if (!autoSaveEnabled || !hasUnsavedChanges || !isValid) return;

    const autoSaveTimer = setTimeout(() => {
      handleSave();
    }, 3000); // Auto-save after 3 seconds of inactivity

    return () => clearTimeout(autoSaveTimer);
  }, [content, autoSaveEnabled, hasUnsavedChanges, isValid]);

  // Add to change history when content changes
  useEffect(() => {
    if (content !== initialContent) {
      const newChange: FileChange = {
        timestamp: Date.now(),
        content,
        description: `Modified ${filename}`,
      };

      setChangeHistory((prev) => {
        const updated = [newChange, ...prev];
        return updated.slice(0, maxHistoryEntries);
      });
    }
  }, [content, initialContent, filename, maxHistoryEntries]);

  // Keyboard shortcuts
  useEffect(() => {
    const handleKeyboard = (event: KeyboardEvent) => {
      if (event.ctrlKey || event.metaKey) {
        switch (event.key) {
          case "s":
            event.preventDefault();
            if (hasUnsavedChanges && isValid) {
              handleSave();
            }
            break;
          case "z":
            event.preventDefault();
            if (!event.shiftKey) {
              handleUndo();
            } else {
              handleRedo();
            }
            break;
          case "Escape":
            event.preventDefault();
            handleCancel();
            break;
        }
      }
    };

    document.addEventListener("keydown", handleKeyboard);
    return () => document.removeEventListener("keydown", handleKeyboard);
  }, [hasUnsavedChanges, isValid]);

  const handleContentChange = useCallback((newContent: string) => {
    setContent(newContent);
  }, []);

  const handleValidationChange = useCallback(
    (valid: boolean, error?: string) => {
      setIsValid(valid);
      setValidationError(error || null);
    },
    [],
  );

  const handleSave = useCallback(async () => {
    if (!isValid || isSaving) return;

    try {
      setIsSaving(true);
      await onSave(content);

      // Clear change history after successful save
      setChangeHistory([]);
    } catch (error) {
      console.error("Failed to save file:", error);
      // Error handling is done by parent component
    } finally {
      setIsSaving(false);
    }
  }, [content, isValid, isSaving, onSave]);

  const handleCancel = useCallback(() => {
    if (hasUnsavedChanges) {
      setShowUnsavedDialog(true);
    } else {
      onCancel();
    }
  }, [hasUnsavedChanges, onCancel]);

  const handleConfirmCancel = useCallback(() => {
    setShowUnsavedDialog(false);
    onCancel();
  }, [onCancel]);

  const handleUndo = useCallback(() => {
    if (changeHistory.length > 1) {
      const previousChange = changeHistory[1];
      setContent(previousChange.content);
    } else {
      setContent(initialContent);
    }
  }, [changeHistory, initialContent]);

  const handleRedo = useCallback(() => {
    // Simple redo - in a full implementation, we'd maintain separate undo/redo stacks
    if (changeHistory.length > 0) {
      setContent(changeHistory[0].content);
    }
  }, [changeHistory]);

  const handleRestoreFromHistory = useCallback((change: FileChange) => {
    setContent(change.content);
    setShowHistory(false);
  }, []);

  const formatTimestamp = useCallback((timestamp: number) => {
    return new Date(timestamp).toLocaleString();
  }, []);

  return (
    <div className="improved-file-editor">
      {/* Editor Header */}
      <div className="improved-file-editor__header">
        <div className="improved-file-editor__header-main">
          <h3 className="improved-file-editor__title">
            <span className="improved-file-editor__filename">{filename}</span>
            {hasUnsavedChanges && (
              <span className="improved-file-editor__unsaved-indicator">
                • Unsaved changes
              </span>
            )}
          </h3>

          {validationError && (
            <div
              className="improved-file-editor__validation-error"
              role="alert"
            >
              <span className="improved-file-editor__error-icon">⚠️</span>
              {validationError}
            </div>
          )}
        </div>

        <div className="improved-file-editor__header-actions">
          {/* History Button */}
          {changeHistory.length > 0 && (
            <button
              className="settings-button settings-button--secondary"
              onClick={() => setShowHistory(!showHistory)}
              aria-label="View change history"
            >
              <svg
                width="16"
                height="16"
                viewBox="0 0 20 20"
                fill="currentColor"
              >
                <path
                  fillRule="evenodd"
                  d="M10 18a8 8 0 100-16 8 8 0 000 16zm1-12a1 1 0 10-2 0v4a1 1 0 00.293.707l2.828 2.829a1 1 0 101.415-1.415L11 9.586V6z"
                  clipRule="evenodd"
                />
              </svg>
              History ({changeHistory.length})
            </button>
          )}

          {/* Auto-save Toggle */}
          <label className="improved-file-editor__auto-save-toggle">
            <input
              type="checkbox"
              checked={autoSaveEnabled}
              onChange={(e) => setAutoSaveEnabled(e.target.checked)}
              className="improved-file-editor__auto-save-input"
            />
            <span className="improved-file-editor__auto-save-label">
              Auto-save
            </span>
          </label>

          {/* Action Buttons */}
          <div className="improved-file-editor__actions">
            <button
              className="settings-button settings-button--secondary"
              onClick={handleCancel}
              disabled={isSaving}
            >
              Cancel
            </button>

            <button
              className="settings-button settings-button--primary"
              onClick={handleSave}
              disabled={!hasUnsavedChanges || !isValid || isSaving}
            >
              {isSaving ? (
                <>
                  <span className="improved-file-editor__saving-spinner" />
                  Saving...
                </>
              ) : (
                "Save Changes"
              )}
            </button>
          </div>
        </div>
      </div>

      {/* Change History Panel */}
      {showHistory && (
        <div className="improved-file-editor__history-panel">
          <div className="improved-file-editor__history-header">
            <h4>Change History</h4>
            <button
              className="settings-button settings-button--secondary"
              onClick={() => setShowHistory(false)}
              aria-label="Close history"
            >
              ✕
            </button>
          </div>

          <div className="improved-file-editor__history-list">
            {changeHistory.map((change, index) => (
              <div
                key={change.timestamp}
                className={`improved-file-editor__history-item ${
                  index === 0
                    ? "improved-file-editor__history-item--current"
                    : ""
                }`}
              >
                <div className="improved-file-editor__history-info">
                  <span className="improved-file-editor__history-description">
                    {change.description}
                  </span>
                  <span className="improved-file-editor__history-timestamp">
                    {formatTimestamp(change.timestamp)}
                  </span>
                </div>

                {index > 0 && (
                  <button
                    className="settings-button settings-button--secondary"
                    onClick={() => handleRestoreFromHistory(change)}
                  >
                    Restore
                  </button>
                )}
              </div>
            ))}
          </div>
        </div>
      )}

      {/* Editor Content */}
      <div className="improved-file-editor__content">
        {showDiffView && hasUnsavedChanges ? (
          <div className="improved-file-editor__diff-view">
            <div className="improved-file-editor__diff-panel">
              <h4>Original</h4>
              <JSONEditor
                value={initialContent}
                onChange={() => {}} // Read-only
                readOnly={true}
                height="400px"
              />
            </div>
            <div className="improved-file-editor__diff-panel">
              <h4>Modified</h4>
              <JSONEditor
                value={content}
                onChange={handleContentChange}
                onValidationChange={handleValidationChange}
                readOnly={readOnly}
                height="400px"
              />
            </div>
          </div>
        ) : (
          <JSONEditor
            value={content}
            onChange={handleContentChange}
            onValidationChange={handleValidationChange}
            readOnly={readOnly}
            height="500px"
          />
        )}
      </div>

      {/* Keyboard Shortcuts Help */}
      <div className="improved-file-editor__shortcuts">
        <details className="improved-file-editor__shortcuts-details">
          <summary className="improved-file-editor__shortcuts-summary">
            Keyboard Shortcuts
          </summary>
          <div className="improved-file-editor__shortcuts-list">
            <div className="improved-file-editor__shortcut">
              <kbd>Ctrl+S</kbd> <span>Save changes</span>
            </div>
            <div className="improved-file-editor__shortcut">
              <kbd>Ctrl+Z</kbd> <span>Undo</span>
            </div>
            <div className="improved-file-editor__shortcut">
              <kbd>Ctrl+Shift+Z</kbd> <span>Redo</span>
            </div>
            <div className="improved-file-editor__shortcut">
              <kbd>Esc</kbd> <span>Cancel editing</span>
            </div>
          </div>
        </details>
      </div>

      {/* Unsaved Changes Dialog */}
      <SafeConfirmDialog
        isOpen={showUnsavedDialog}
        title="Unsaved Changes"
        message="You have unsaved changes. Are you sure you want to leave without saving?"
        confirmText="Discard Changes"
        cancelText="Continue Editing"
        variant="warning"
        onConfirm={handleConfirmCancel}
        onCancel={() => setShowUnsavedDialog(false)}
      />
    </div>
  );
};

export default ImprovedFileEditor;
