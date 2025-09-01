import React, { useState, useCallback, useMemo } from "react";
import type { PermissionSettings } from "../../types";

interface EditablePermissionsProps {
  permissions: PermissionSettings;
  onChange: (permissions: PermissionSettings) => void;
  isEditing: boolean;
}

export const EditablePermissions: React.FC<EditablePermissionsProps> = ({
  permissions,
  onChange,
  isEditing,
}) => {
  const [newAllowCommand, setNewAllowCommand] = useState("");
  const [newDenyCommand, setNewDenyCommand] = useState("");
  const [showAllowInput, setShowAllowInput] = useState(false);
  const [showDenyInput, setShowDenyInput] = useState(false);

  const handleDefaultModeChange = useCallback(
    (e: React.ChangeEvent<HTMLSelectElement>) => {
      onChange({
        ...permissions,
        defaultMode: e.target.value,
      });
    },
    [permissions, onChange],
  );

  const handleAddAllowCommand = useCallback(() => {
    if (newAllowCommand.trim()) {
      onChange({
        ...permissions,
        allow: [...permissions.allow, newAllowCommand.trim()],
      });
      setNewAllowCommand("");
      setShowAllowInput(false);
    }
  }, [permissions, onChange, newAllowCommand]);

  const handleAddDenyCommand = useCallback(() => {
    if (newDenyCommand.trim()) {
      onChange({
        ...permissions,
        deny: [...permissions.deny, newDenyCommand.trim()],
      });
      setNewDenyCommand("");
      setShowDenyInput(false);
    }
  }, [permissions, onChange, newDenyCommand]);

  const handleRemoveAllowCommand = useCallback(
    (index: number) => {
      onChange({
        ...permissions,
        allow: permissions.allow.filter((_, i) => i !== index),
      });
    },
    [permissions, onChange],
  );

  const handleRemoveDenyCommand = useCallback(
    (index: number) => {
      onChange({
        ...permissions,
        deny: permissions.deny.filter((_, i) => i !== index),
      });
    },
    [permissions, onChange],
  );

  const validationErrors = useMemo(() => {
    const errors: string[] = [];
    const allCommands = [...permissions.allow, ...permissions.deny];
    const duplicates = allCommands.filter(
      (cmd, index) => allCommands.indexOf(cmd) !== index,
    );
    if (duplicates.length > 0) {
      errors.push(`Duplicate commands found: ${duplicates.join(", ")}`);
    }
    return errors;
  }, [permissions]);

  if (!isEditing) {
    return (
      <div className="permissions-view">
        <div className="permission-item">
          <span className="permission-label">Default Mode:</span>
          <span className="permission-value">{permissions.defaultMode}</span>
        </div>

        <div className="permission-group">
          <h4>Allowed Commands</h4>
          {permissions.allow.length === 0 ? (
            <p className="empty-list">No allowed commands specified</p>
          ) : (
            <ul className="permission-list">
              {permissions.allow.map((item, index) => (
                <li key={index} className="permission-list-item allow">
                  <code>{item}</code>
                </li>
              ))}
            </ul>
          )}
        </div>

        <div className="permission-group">
          <h4>Denied Commands</h4>
          {permissions.deny.length === 0 ? (
            <p className="empty-list">No denied commands specified</p>
          ) : (
            <ul className="permission-list">
              {permissions.deny.map((item, index) => (
                <li key={index} className="permission-list-item deny">
                  <code>{item}</code>
                </li>
              ))}
            </ul>
          )}
        </div>
      </div>
    );
  }

  return (
    <div className="editable-permissions">
      {validationErrors.length > 0 && (
        <div className="validation-errors">
          <h4>⚠️ Validation Issues</h4>
          <ul>
            {validationErrors.map((error, index) => (
              <li key={index}>{error}</li>
            ))}
          </ul>
        </div>
      )}

      <div className="permission-item">
        <label htmlFor="default-mode" className="permission-label">
          Default Mode:
        </label>
        <select
          id="default-mode"
          value={permissions.defaultMode}
          onChange={handleDefaultModeChange}
          className="permission-select"
        >
          <option value="ask">Ask</option>
          <option value="allow">Allow</option>
          <option value="deny">Deny</option>
        </select>
        <span className="permission-hint">
          Controls how Claude handles commands by default
        </span>
      </div>

      <div className="permission-group">
        <div className="permission-group-header">
          <h4>Allowed Commands</h4>
          <button
            type="button"
            onClick={() => setShowAllowInput(true)}
            className="add-button"
            disabled={showAllowInput}
          >
            + Add Command
          </button>
        </div>

        {showAllowInput && (
          <div className="command-input-container">
            <input
              type="text"
              value={newAllowCommand}
              onChange={(e) => setNewAllowCommand(e.target.value)}
              onKeyDown={(e) => {
                if (e.key === "Enter") handleAddAllowCommand();
                if (e.key === "Escape") {
                  setNewAllowCommand("");
                  setShowAllowInput(false);
                }
              }}
              placeholder="Enter command pattern (e.g., git *, npm install)"
              className="command-input"
              autoFocus
            />
            <div className="command-input-actions">
              <button
                type="button"
                onClick={handleAddAllowCommand}
                className="confirm-button"
                disabled={!newAllowCommand.trim()}
              >
                Add
              </button>
              <button
                type="button"
                onClick={() => {
                  setNewAllowCommand("");
                  setShowAllowInput(false);
                }}
                className="cancel-button"
              >
                Cancel
              </button>
            </div>
          </div>
        )}

        {permissions.allow.length === 0 ? (
          <p className="empty-list">No allowed commands specified</p>
        ) : (
          <ul className="permission-list editable">
            {permissions.allow.map((item, index) => (
              <li key={index} className="permission-list-item allow">
                <code>{item}</code>
                <button
                  type="button"
                  onClick={() => handleRemoveAllowCommand(index)}
                  className="remove-button"
                  aria-label={`Remove ${item}`}
                >
                  ×
                </button>
              </li>
            ))}
          </ul>
        )}
      </div>

      <div className="permission-group">
        <div className="permission-group-header">
          <h4>Denied Commands</h4>
          <button
            type="button"
            onClick={() => setShowDenyInput(true)}
            className="add-button"
            disabled={showDenyInput}
          >
            + Add Command
          </button>
        </div>

        {showDenyInput && (
          <div className="command-input-container">
            <input
              type="text"
              value={newDenyCommand}
              onChange={(e) => setNewDenyCommand(e.target.value)}
              onKeyDown={(e) => {
                if (e.key === "Enter") handleAddDenyCommand();
                if (e.key === "Escape") {
                  setNewDenyCommand("");
                  setShowDenyInput(false);
                }
              }}
              placeholder="Enter command pattern (e.g., rm -rf, sudo *)"
              className="command-input"
              autoFocus
            />
            <div className="command-input-actions">
              <button
                type="button"
                onClick={handleAddDenyCommand}
                className="confirm-button"
                disabled={!newDenyCommand.trim()}
              >
                Add
              </button>
              <button
                type="button"
                onClick={() => {
                  setNewDenyCommand("");
                  setShowDenyInput(false);
                }}
                className="cancel-button"
              >
                Cancel
              </button>
            </div>
          </div>
        )}

        {permissions.deny.length === 0 ? (
          <p className="empty-list">No denied commands specified</p>
        ) : (
          <ul className="permission-list editable">
            {permissions.deny.map((item, index) => (
              <li key={index} className="permission-list-item deny">
                <code>{item}</code>
                <button
                  type="button"
                  onClick={() => handleRemoveDenyCommand(index)}
                  className="remove-button"
                  aria-label={`Remove ${item}`}
                >
                  ×
                </button>
              </li>
            ))}
          </ul>
        )}
      </div>
    </div>
  );
};
