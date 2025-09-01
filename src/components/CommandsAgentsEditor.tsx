import { useState, useEffect } from "react";
import { api } from "../api";
import type { CustomCommand, Agent } from "../types";
import { SafeConfirmDialog } from "./SafeConfirmDialog";
import { validateFileName } from "../utils/security";

type EditorMode = "commands" | "agents";

export function CommandsAgentsEditor() {
  const [mode, setMode] = useState<EditorMode>("commands");
  const [commands, setCommands] = useState<CustomCommand[]>([]);
  const [agents, setAgents] = useState<Agent[]>([]);
  const [selectedItem, setSelectedItem] = useState<string | null>(null);
  const [content, setContent] = useState<string>("");
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [hasChanges, setHasChanges] = useState(false);
  const [isSaving, setIsSaving] = useState(false);
  const [isCreating, setIsCreating] = useState(false);
  const [newItemName, setNewItemName] = useState("");
  const [showDiscardDialog, setShowDiscardDialog] = useState(false);
  const [showDeleteDialog, setShowDeleteDialog] = useState(false);
  const [isEditingName, setIsEditingName] = useState(false);
  const [editingName, setEditingName] = useState("");
  const [pendingAction, setPendingAction] = useState<(() => void) | null>(null);

  useEffect(() => {
    loadData();
  }, [mode]);

  const loadData = async () => {
    try {
      setIsLoading(true);
      setError(null);

      if (mode === "commands") {
        const loadedCommands = await api.getCustomCommands();
        setCommands(loadedCommands);

        if (loadedCommands.length > 0 && !selectedItem) {
          setSelectedItem(loadedCommands[0].name);
          setContent(loadedCommands[0].content);
        }
      } else {
        const loadedAgents = await api.getAgents();
        setAgents(loadedAgents);

        if (loadedAgents.length > 0 && !selectedItem) {
          setSelectedItem(loadedAgents[0].name);
          setContent(loadedAgents[0].content);
        }
      }
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to load data");
    } finally {
      setIsLoading(false);
    }
  };

  const handleModeChange = (newMode: EditorMode) => {
    if (hasChanges) {
      setPendingAction(() => () => {
        setMode(newMode);
        setSelectedItem(null);
        setContent("");
        setHasChanges(false);
        setIsCreating(false);
        setNewItemName("");
      });
      setShowDiscardDialog(true);
      return;
    }

    setMode(newMode);
    setSelectedItem(null);
    setContent("");
    setHasChanges(false);
    setIsCreating(false);
    setNewItemName("");
  };

  const handleItemSelect = (name: string) => {
    // 名前の検証
    const validation = validateFileName(name);
    if (!validation.valid) {
      setError(validation.error || "Invalid item name");
      return;
    }

    if (hasChanges) {
      setPendingAction(() => () => {
        const items = mode === "commands" ? commands : agents;
        const item = items.find((i) => i.name === name);

        if (item) {
          setSelectedItem(name);
          setContent(item.content);
          setHasChanges(false);
          setIsCreating(false);
          setNewItemName("");
        }
      });
      setShowDiscardDialog(true);
      return;
    }

    const items = mode === "commands" ? commands : agents;
    const item = items.find((i) => i.name === name);

    if (item) {
      setSelectedItem(name);
      setContent(item.content);
      setHasChanges(false);
      setIsCreating(false);
      setNewItemName("");
    }
  };

  const handleContentChange = (e: React.ChangeEvent<HTMLTextAreaElement>) => {
    setContent(e.target.value);
    setHasChanges(true);
  };

  const handleSave = async () => {
    if (!selectedItem && !isCreating) return;

    const name = isCreating ? newItemName : selectedItem!;

    // 名前の検証
    const nameValidation = validateFileName(name);
    if (!nameValidation.valid) {
      setError(nameValidation.error || "Invalid name");
      return;
    }

    // コンテンツサイズチェック
    if (content.length > 1024 * 1024) {
      // 1MB制限
      setError("コンテンツが大きすぎます（最大1MB）");
      return;
    }

    try {
      setIsSaving(true);

      if (mode === "commands") {
        await api.saveCustomCommand(name, content);

        if (isCreating) {
          setCommands((prev) =>
            [...prev, { name, content }].sort((a, b) =>
              a.name.localeCompare(b.name),
            ),
          );
          setSelectedItem(name);
          setIsCreating(false);
          setNewItemName("");
        } else {
          setCommands((prev) =>
            prev.map((cmd) => (cmd.name === name ? { name, content } : cmd)),
          );
        }
      } else {
        await api.saveAgent(name, content);

        if (isCreating) {
          setAgents((prev) =>
            [...prev, { name, content }].sort((a, b) =>
              a.name.localeCompare(b.name),
            ),
          );
          setSelectedItem(name);
          setIsCreating(false);
          setNewItemName("");
        } else {
          setAgents((prev) =>
            prev.map((agent) =>
              agent.name === name ? { name, content } : agent,
            ),
          );
        }
      }

      setHasChanges(false);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to save");
    } finally {
      setIsSaving(false);
    }
  };

  const handleDelete = async () => {
    if (!selectedItem || isCreating) return;
    setShowDeleteDialog(true);
  };

  const confirmDelete = async () => {
    if (!selectedItem || isCreating) return;

    try {
      if (mode === "commands") {
        await api.deleteCustomCommand(selectedItem);
        setCommands((prev) => prev.filter((cmd) => cmd.name !== selectedItem));
      } else {
        await api.deleteAgent(selectedItem);
        setAgents((prev) =>
          prev.filter((agent) => agent.name !== selectedItem),
        );
      }

      setSelectedItem(null);
      setContent("");
      setHasChanges(false);

      // Select the first item if available
      const items = mode === "commands" ? commands : agents;
      if (items.length > 1) {
        const newSelection = items.find((i) => i.name !== selectedItem);
        if (newSelection) {
          setSelectedItem(newSelection.name);
          setContent(newSelection.content);
        }
      }
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to delete");
    }
  };

  const handleCreate = () => {
    if (hasChanges) {
      setPendingAction(() => () => {
        setIsCreating(true);
        setSelectedItem(null);
        setContent("");
        setNewItemName("");
        setHasChanges(false);
      });
      setShowDiscardDialog(true);
      return;
    }

    setIsCreating(true);
    setSelectedItem(null);
    setContent("");
    setNewItemName("");
    setHasChanges(false);
  };

  const handleCancelCreate = () => {
    setIsCreating(false);
    setNewItemName("");
    setContent("");
    setHasChanges(false);

    // Select the first item if available
    const items = mode === "commands" ? commands : agents;
    if (items.length > 0) {
      setSelectedItem(items[0].name);
      setContent(items[0].content);
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

  const handleCancelDelete = () => {
    setShowDeleteDialog(false);
  };

  const handleStartEditing = () => {
    if (!selectedItem || isCreating) return;
    setIsEditingName(true);
    setEditingName(selectedItem);
  };

  const handleConfirmEdit = async () => {
    if (!selectedItem || isCreating || !editingName.trim()) return;

    const oldName = selectedItem;
    const newName = editingName.trim();

    // 名前が変更されていない場合は編集モードを終了
    if (oldName === newName) {
      setIsEditingName(false);
      setEditingName("");
      return;
    }

    // 名前の検証
    const nameValidation = validateFileName(newName);
    if (!nameValidation.valid) {
      setError(nameValidation.error || "Invalid name");
      return;
    }

    try {
      if (mode === "commands") {
        await api.renameCustomCommand(oldName, newName);
        setCommands((prev) =>
          prev
            .map((cmd) =>
              cmd.name === oldName ? { ...cmd, name: newName } : cmd,
            )
            .sort((a, b) => a.name.localeCompare(b.name)),
        );
      } else {
        await api.renameAgent(oldName, newName);
        setAgents((prev) =>
          prev
            .map((agent) =>
              agent.name === oldName ? { ...agent, name: newName } : agent,
            )
            .sort((a, b) => a.name.localeCompare(b.name)),
        );
      }

      setSelectedItem(newName);
      setIsEditingName(false);
      setEditingName("");
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to rename");
    }
  };

  const handleCancelEdit = () => {
    setIsEditingName(false);
    setEditingName("");
  };

  if (isLoading) {
    return <div className="loading">Loading...</div>;
  }

  if (error) {
    return <div className="error">Error: {error}</div>;
  }

  const items = mode === "commands" ? commands : agents;

  return (
    <div className="commands-agents-editor">
      <div className="editor-header">
        <div className="mode-switcher">
          <button
            className={mode === "commands" ? "active" : ""}
            onClick={() => handleModeChange("commands")}
          >
            Commands
          </button>
          <button
            className={mode === "agents" ? "active" : ""}
            onClick={() => handleModeChange("agents")}
          >
            Agents
          </button>
        </div>

        <div className="editor-actions">
          <button onClick={handleCreate} className="btn-secondary">
            New {mode === "commands" ? "Command" : "Agent"}
          </button>
          {!isCreating && selectedItem && (
            <button onClick={handleDelete} className="btn-danger">
              Delete
            </button>
          )}
          {(hasChanges || isCreating) && (
            <>
              {isCreating && (
                <button onClick={handleCancelCreate} className="btn-secondary">
                  Cancel
                </button>
              )}
              <button
                onClick={handleSave}
                disabled={isSaving || (isCreating && !newItemName.trim())}
                className="btn-primary"
              >
                {isSaving ? "Saving..." : "Save"}
              </button>
            </>
          )}
        </div>
      </div>

      <div className="editor-layout">
        <div className="item-list">
          <h3>{mode === "commands" ? "Commands" : "Agents"}</h3>
          <ul>
            {items.map((item) => (
              <li
                key={item.name}
                className={selectedItem === item.name ? "selected" : ""}
                onClick={() => handleItemSelect(item.name)}
              >
                <span className="item-icon">
                  {mode === "commands" ? "⚡" : "🤖"}
                </span>
                {item.name}
              </li>
            ))}
          </ul>
        </div>

        <div className="editor-content">
          {isCreating && (
            <div className="create-form">
              <label>
                {mode === "commands" ? "Command" : "Agent"} Name:
                <input
                  type="text"
                  value={newItemName}
                  onChange={(e) => setNewItemName(e.target.value)}
                  placeholder={`Enter ${mode === "commands" ? "command" : "agent"} name`}
                  autoFocus
                  autoComplete="off"
                />
              </label>
            </div>
          )}

          {(selectedItem || isCreating) && (
            <>
              <div className="content-header">
                {isCreating ? (
                  <h3>New {mode === "commands" ? "Command" : "Agent"}</h3>
                ) : isEditingName ? (
                  <input
                    type="text"
                    value={editingName}
                    onChange={(e) => setEditingName(e.target.value)}
                    onKeyDown={(e) => {
                      if (e.key === "Enter") {
                        handleConfirmEdit();
                      } else if (e.key === "Escape") {
                        handleCancelEdit();
                      }
                    }}
                    onBlur={handleConfirmEdit}
                    className="content-header-edit"
                    autoFocus
                    autoComplete="off"
                  />
                ) : (
                  <h3
                    onClick={handleStartEditing}
                    className="content-header-title"
                    title="Click to rename"
                  >
                    {selectedItem}
                  </h3>
                )}
                {hasChanges && (
                  <span className="unsaved-indicator">• Unsaved changes</span>
                )}
              </div>

              <textarea
                value={content}
                onChange={handleContentChange}
                placeholder={`Enter ${mode === "commands" ? "command" : "agent"} content (Markdown supported)`}
                className="content-editor"
                readOnly={isSaving}
                style={{
                  height: "calc(100vh - 220px)",
                  scrollBehavior: "smooth",
                }}
              />
            </>
          )}

          {!selectedItem && !isCreating && items.length === 0 && (
            <div className="empty-state">
              <p>No {mode} found in ~/.claude directory</p>
              <button onClick={handleCreate} className="btn-primary">
                Create your first {mode === "commands" ? "command" : "agent"}
              </button>
            </div>
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

      <SafeConfirmDialog
        isOpen={showDeleteDialog}
        title="削除の確認"
        message={`"${selectedItem}" を完全に削除しますか？この操作は取り消せません。`}
        confirmText="削除"
        cancelText="キャンセル"
        variant="danger"
        onConfirm={() => {
          confirmDelete();
          setShowDeleteDialog(false);
        }}
        onCancel={handleCancelDelete}
      />
    </div>
  );
}
