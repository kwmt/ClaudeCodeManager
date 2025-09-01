import React, { useState, useCallback } from "react";
import type { HookSettings, HookMatcher, Hook } from "../../types";

interface EditableHooksProps {
  hooks: HookSettings;
  onChange: (hooks: HookSettings) => void;
  isEditing: boolean;
}

export const EditableHooks: React.FC<EditableHooksProps> = ({
  hooks,
  onChange,
  isEditing,
}) => {
  const [showNewMatcher, setShowNewMatcher] = useState(false);
  const [newMatcher, setNewMatcher] = useState("");
  const [expandedMatchers, setExpandedMatchers] = useState<Set<string>>(
    new Set(),
  );

  const handleAddMatcher = useCallback(() => {
    if (newMatcher.trim()) {
      const newHookMatcher: HookMatcher = {
        matcher: newMatcher.trim(),
        hooks: [],
      };
      onChange({
        ...hooks,
        PreToolUse: [...hooks.PreToolUse, newHookMatcher],
      });
      setNewMatcher("");
      setShowNewMatcher(false);
      setExpandedMatchers(new Set([...expandedMatchers, newMatcher.trim()]));
    }
  }, [hooks, onChange, newMatcher, expandedMatchers]);

  const handleRemoveMatcher = useCallback(
    (matcherIndex: number) => {
      onChange({
        ...hooks,
        PreToolUse: hooks.PreToolUse.filter((_, i) => i !== matcherIndex),
      });
    },
    [hooks, onChange],
  );

  const handleAddHook = useCallback(
    (matcherIndex: number, hook: Hook) => {
      const updatedMatchers = [...hooks.PreToolUse];
      updatedMatchers[matcherIndex] = {
        ...updatedMatchers[matcherIndex],
        hooks: [...updatedMatchers[matcherIndex].hooks, hook],
      };
      onChange({
        ...hooks,
        PreToolUse: updatedMatchers,
      });
    },
    [hooks, onChange],
  );

  const handleRemoveHook = useCallback(
    (matcherIndex: number, hookIndex: number) => {
      const updatedMatchers = [...hooks.PreToolUse];
      updatedMatchers[matcherIndex] = {
        ...updatedMatchers[matcherIndex],
        hooks: updatedMatchers[matcherIndex].hooks.filter(
          (_, i) => i !== hookIndex,
        ),
      };
      onChange({
        ...hooks,
        PreToolUse: updatedMatchers,
      });
    },
    [hooks, onChange],
  );

  const toggleMatcherExpansion = useCallback((matcher: string) => {
    setExpandedMatchers((prev) => {
      const newSet = new Set(prev);
      if (newSet.has(matcher)) {
        newSet.delete(matcher);
      } else {
        newSet.add(matcher);
      }
      return newSet;
    });
  }, []);

  if (!isEditing) {
    return (
      <div className="hooks-group">
        <h4>Pre-Tool Use Hooks</h4>
        {hooks.PreToolUse.length === 0 ? (
          <p className="empty-list">No pre-tool use hooks configured</p>
        ) : (
          <div className="hooks-list">
            {hooks.PreToolUse.map((matcher) => (
              <div key={matcher.matcher} className="hook-matcher">
                <h5>
                  Matcher: <code>{matcher.matcher}</code>
                </h5>
                <div className="hook-commands">
                  {matcher.hooks.map((hook, index) => (
                    <div key={index} className="hook-command">
                      <div className="hook-type">Type: {hook.type}</div>
                      <div className="hook-command-text">
                        <code>{hook.command}</code>
                      </div>
                    </div>
                  ))}
                </div>
              </div>
            ))}
          </div>
        )}
      </div>
    );
  }

  return (
    <div className="editable-hooks">
      <div className="hooks-header">
        <h4>Pre-Tool Use Hooks</h4>
        <button
          type="button"
          onClick={() => setShowNewMatcher(true)}
          className="add-button"
          disabled={showNewMatcher}
        >
          + Add Hook Matcher
        </button>
      </div>

      {showNewMatcher && (
        <div className="new-matcher-container">
          <input
            type="text"
            value={newMatcher}
            onChange={(e) => setNewMatcher(e.target.value)}
            onKeyDown={(e) => {
              if (e.key === "Enter") handleAddMatcher();
              if (e.key === "Escape") {
                setNewMatcher("");
                setShowNewMatcher(false);
              }
            }}
            placeholder="Enter matcher pattern (e.g., bash.*, git.*)"
            className="matcher-input"
            autoFocus
          />
          <div className="matcher-input-actions">
            <button
              type="button"
              onClick={handleAddMatcher}
              className="confirm-button"
              disabled={!newMatcher.trim()}
            >
              Add
            </button>
            <button
              type="button"
              onClick={() => {
                setNewMatcher("");
                setShowNewMatcher(false);
              }}
              className="cancel-button"
            >
              Cancel
            </button>
          </div>
          <div className="matcher-help">
            Examples: <code>bash.*</code>, <code>git.*</code>,{" "}
            <code>npm install</code>
          </div>
        </div>
      )}

      {hooks.PreToolUse.length === 0 ? (
        <p className="empty-list">No pre-tool use hooks configured</p>
      ) : (
        <div className="hooks-list">
          {hooks.PreToolUse.map((matcher, matcherIndex) => (
            <HookMatcherEditor
              key={matcher.matcher}
              matcher={matcher}
              isExpanded={expandedMatchers.has(matcher.matcher)}
              onToggleExpansion={() => toggleMatcherExpansion(matcher.matcher)}
              onRemove={() => handleRemoveMatcher(matcherIndex)}
              onAddHook={(hook) => handleAddHook(matcherIndex, hook)}
              onRemoveHook={(hookIndex) =>
                handleRemoveHook(matcherIndex, hookIndex)
              }
            />
          ))}
        </div>
      )}
    </div>
  );
};

interface HookMatcherEditorProps {
  matcher: HookMatcher;
  isExpanded: boolean;
  onToggleExpansion: () => void;
  onRemove: () => void;
  onAddHook: (hook: Hook) => void;
  onRemoveHook: (hookIndex: number) => void;
}

const HookMatcherEditor: React.FC<HookMatcherEditorProps> = ({
  matcher,
  isExpanded,
  onToggleExpansion,
  onRemove,
  onAddHook,
  onRemoveHook,
}) => {
  const [showNewHook, setShowNewHook] = useState(false);
  const [newHookType, setNewHookType] = useState("sync");
  const [newHookCommand, setNewHookCommand] = useState("");

  const handleAddHook = useCallback(() => {
    if (newHookCommand.trim()) {
      onAddHook({
        type: newHookType,
        command: newHookCommand.trim(),
      });
      setNewHookCommand("");
      setShowNewHook(false);
    }
  }, [newHookType, newHookCommand, onAddHook]);

  return (
    <div className="hook-matcher-editor">
      <div className="matcher-header">
        <button
          type="button"
          onClick={onToggleExpansion}
          className="expansion-toggle"
          aria-expanded={isExpanded}
        >
          {isExpanded ? "▼" : "▶"}
        </button>
        <h5 className="matcher-title">
          Matcher: <code>{matcher.matcher}</code>
        </h5>
        <span className="hook-count">({matcher.hooks.length} hooks)</span>
        <button
          type="button"
          onClick={onRemove}
          className="remove-button"
          aria-label={`Remove matcher ${matcher.matcher}`}
        >
          ×
        </button>
      </div>

      {isExpanded && (
        <div className="matcher-content">
          <div className="hooks-section">
            {matcher.hooks.length === 0 ? (
              <p className="empty-hooks">
                No hooks configured for this matcher
              </p>
            ) : (
              <div className="hook-list">
                {matcher.hooks.map((hook, index) => (
                  <div key={index} className="hook-item">
                    <div className="hook-details">
                      <span className="hook-type-badge">{hook.type}</span>
                      <code className="hook-command">{hook.command}</code>
                    </div>
                    <button
                      type="button"
                      onClick={() => onRemoveHook(index)}
                      className="remove-button small"
                      aria-label={`Remove hook ${hook.command}`}
                    >
                      ×
                    </button>
                  </div>
                ))}
              </div>
            )}

            {showNewHook ? (
              <div className="new-hook-form">
                <div className="hook-type-selector">
                  <label htmlFor={`hook-type-${matcher.matcher}`}>Type:</label>
                  <select
                    id={`hook-type-${matcher.matcher}`}
                    value={newHookType}
                    onChange={(e) => setNewHookType(e.target.value)}
                    className="hook-type-select"
                  >
                    <option value="sync">sync</option>
                    <option value="async">async</option>
                  </select>
                </div>
                <div className="hook-command-input">
                  <input
                    type="text"
                    value={newHookCommand}
                    onChange={(e) => setNewHookCommand(e.target.value)}
                    onKeyDown={(e) => {
                      if (e.key === "Enter") handleAddHook();
                      if (e.key === "Escape") {
                        setNewHookCommand("");
                        setShowNewHook(false);
                      }
                    }}
                    placeholder='Enter command (e.g., echo "Running command...")'
                    className="command-input"
                    autoFocus
                  />
                </div>
                <div className="hook-form-actions">
                  <button
                    type="button"
                    onClick={handleAddHook}
                    className="confirm-button small"
                    disabled={!newHookCommand.trim()}
                  >
                    Add
                  </button>
                  <button
                    type="button"
                    onClick={() => {
                      setNewHookCommand("");
                      setShowNewHook(false);
                    }}
                    className="cancel-button small"
                  >
                    Cancel
                  </button>
                </div>
              </div>
            ) : (
              <button
                type="button"
                onClick={() => setShowNewHook(true)}
                className="add-button small"
              >
                + Add Hook
              </button>
            )}
          </div>
        </div>
      )}
    </div>
  );
};
