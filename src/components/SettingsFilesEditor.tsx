import { useState, useEffect } from "react";
import { api } from "../api";
import JSONEditor from "./JSONEditor";
import { SafeConfirmDialog } from "./SafeConfirmDialog";
import { validateFileName } from "../utils/security";

export function SettingsFilesEditor() {
  const [settingsFiles, setSettingsFiles] = useState<[string, string][]>([]);
  const [selectedFile, setSelectedFile] = useState<string | null>(null);
  const [selectedContent, setSelectedContent] = useState<string>("");
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [hasChanges, setHasChanges] = useState(false);
  const [isSaving, setIsSaving] = useState(false);
  const [showDiscardDialog, setShowDiscardDialog] = useState(false);
  const [pendingAction, setPendingAction] = useState<(() => void) | null>(null);

  useEffect(() => {
    loadSettingsFiles();
  }, []);

  const loadSettingsFiles = async () => {
    try {
      setIsLoading(true);
      const files = await api.getAllSettingsFiles();
      setSettingsFiles(files);

      // Select the first file by default
      if (files.length > 0 && !selectedFile) {
        setSelectedFile(files[0][0]);
        setSelectedContent(files[0][1]);
      }
    } catch (err) {
      setError(
        err instanceof Error ? err.message : "Failed to load settings files",
      );
    } finally {
      setIsLoading(false);
    }
  };

  const handleFileSelect = (filename: string) => {
    // ファイル名の検証
    const validation = validateFileName(filename);
    if (!validation.valid) {
      setError(validation.error || "Invalid filename");
      return;
    }

    const file = settingsFiles.find(([name]) => name === filename);
    if (file) {
      if (hasChanges) {
        setPendingAction(() => () => {
          setSelectedFile(filename);
          setSelectedContent(file[1]);
          setHasChanges(false);
        });
        setShowDiscardDialog(true);
        return;
      }

      setSelectedFile(filename);
      setSelectedContent(file[1]);
      setHasChanges(false);
    }
  };

  const handleContentChange = (newContent: string) => {
    setSelectedContent(newContent);
    setHasChanges(true);
  };

  const handleSave = async () => {
    if (!selectedFile) return;

    // 追加のセキュリティ検証
    const fileValidation = validateFileName(selectedFile);
    if (!fileValidation.valid) {
      setError(fileValidation.error || "Invalid filename");
      return;
    }

    // コンテンツサイズチェック
    if (selectedContent.length > 1024 * 1024) {
      // 1MB制限
      setError("ファイルサイズが大きすぎます（最大1MB）");
      return;
    }

    try {
      setIsSaving(true);
      await api.saveSettingsFile(selectedFile, selectedContent);

      // Update the local state
      setSettingsFiles((prev) =>
        prev.map(([name, content]) =>
          name === selectedFile ? [name, selectedContent] : [name, content],
        ),
      );

      setHasChanges(false);
    } catch (err) {
      setError(
        err instanceof Error ? err.message : "Failed to save settings file",
      );
    } finally {
      setIsSaving(false);
    }
  };

  const handleRevert = () => {
    if (!selectedFile || !hasChanges) return;

    const file = settingsFiles.find(([name]) => name === selectedFile);
    if (file) {
      setSelectedContent(file[1]);
      setHasChanges(false);
    }
  };

  // ダイアログハンドラー
  const handleConfirmDiscard = () => {
    if (pendingAction) {
      pendingAction();
      setPendingAction(null);
    }
    setShowDiscardDialog(false);
  };

  const handleCancelDiscard = () => {
    setPendingAction(null);
    setShowDiscardDialog(false);
  };

  if (isLoading) {
    return <div className="loading">Loading settings files...</div>;
  }

  if (error) {
    return <div className="error">Error: {error}</div>;
  }

  if (settingsFiles.length === 0) {
    return (
      <div className="empty-state">
        <p>No settings files found in ~/.claude directory</p>
      </div>
    );
  }

  return (
    <div className="settings-files-editor">
      <div className="editor-header">
        <h2>Claude Settings Files</h2>
        <div className="editor-actions">
          <button
            onClick={handleRevert}
            disabled={!hasChanges || isSaving}
            className="btn-secondary"
          >
            Revert Changes
          </button>
          <button
            onClick={handleSave}
            disabled={!hasChanges || isSaving}
            className="btn-primary"
          >
            {isSaving ? "Saving..." : "Save Changes"}
          </button>
        </div>
      </div>

      <div className="editor-layout">
        <div className="file-list">
          <h3>Settings Files</h3>
          <ul>
            {settingsFiles.map(([filename]) => (
              <li
                key={filename}
                className={selectedFile === filename ? "selected" : ""}
                onClick={() => handleFileSelect(filename)}
              >
                <span className="file-icon">📄</span>
                {filename}
              </li>
            ))}
          </ul>
        </div>

        <div className="editor-content">
          {selectedFile && (
            <>
              <div className="file-header">
                <h3>{selectedFile}</h3>
                {hasChanges && (
                  <span className="unsaved-indicator">• Unsaved changes</span>
                )}
              </div>
              <JSONEditor
                value={selectedContent}
                onChange={handleContentChange}
                readOnly={isSaving}
                height="calc(100vh - 250px)"
              />
            </>
          )}
        </div>
      </div>

      <SafeConfirmDialog
        isOpen={showDiscardDialog}
        title="変更を破棄しますか？"
        message="保存されていない変更があります。これらの変更を破棄してもよろしいですか？"
        confirmText="破棄"
        cancelText="キャンセル"
        variant="warning"
        onConfirm={handleConfirmDiscard}
        onCancel={handleCancelDiscard}
      />
    </div>
  );
}
