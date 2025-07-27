import { type FC, useCallback, useEffect, useState } from "react";
import { api } from "../api";
import type { ClaudeSettings } from "../types";

export const SettingsEditor: FC = () => {
  const [settings, setSettings] = useState<ClaudeSettings | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const loadSettings = useCallback(async () => {
    try {
      setLoading(true);
      setError(null);
      const data = await api.getSettings();
      setSettings(data);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to load settings");
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    loadSettings();
  }, [loadSettings]);

  const exportSettings = async () => {
    if (!settings) return;

    try {
      const data = JSON.stringify(settings, null, 2);
      const blob = new Blob([data], { type: "application/json" });
      const url = URL.createObjectURL(blob);
      const a = document.createElement("a");
      a.href = url;
      a.download = "claude_settings.json";
      document.body.appendChild(a);
      a.click();
      document.body.removeChild(a);
      URL.revokeObjectURL(url);
    } catch (err) {
      setError(
        err instanceof Error ? err.message : "Failed to export settings",
      );
    }
  };

  if (error) {
    return (
      <div className="settings-editor-error">
        <h3>Error</h3>
        <p>{error}</p>
        <button type="button" onClick={loadSettings}>
          Retry
        </button>
      </div>
    );
  }

  return (
    <div className="settings-editor">
      <div className="settings-editor-header">
        <h2>Settings Editor</h2>
        <div className="header-actions">
          <button
            type="button"
            onClick={exportSettings}
            className="export-button"
          >
            Export Settings
          </button>
        </div>
      </div>

      {loading ? (
        <div className="loading">Loading settings...</div>
      ) : !settings ? (
        <div className="no-settings">No settings found</div>
      ) : (
        <div className="settings-content">
          <div className="settings-section">
            <h3>Permissions</h3>
            <div className="permission-item">
              <span className="permission-label">Default Mode:</span>
              <span className="permission-value">
                {settings.permissions.defaultMode}
              </span>
            </div>

            <div className="permission-group">
              <h4>Allowed Commands</h4>
              {settings.permissions.allow.length === 0 ? (
                <p className="empty-list">No allowed commands specified</p>
              ) : (
                <ul className="permission-list">
                  {settings.permissions.allow.map((item) => (
                    <li key={item} className="permission-list-item allow">
                      <code>{item}</code>
                    </li>
                  ))}
                </ul>
              )}
            </div>

            <div className="permission-group">
              <h4>Denied Commands</h4>
              {settings.permissions.deny.length === 0 ? (
                <p className="empty-list">No denied commands specified</p>
              ) : (
                <ul className="permission-list">
                  {settings.permissions.deny.map((item) => (
                    <li key={item} className="permission-list-item deny">
                      <code>{item}</code>
                    </li>
                  ))}
                </ul>
              )}
            </div>
          </div>

          <div className="settings-section">
            <h3>Hooks</h3>
            <div className="hooks-group">
              <h4>Pre-Tool Use Hooks</h4>
              {settings.hooks.PreToolUse.length === 0 ? (
                <p className="empty-list">No pre-tool use hooks configured</p>
              ) : (
                <div className="hooks-list">
                  {settings.hooks.PreToolUse.map((matcher) => (
                    <div key={matcher.matcher} className="hook-matcher">
                      <h5>
                        Matcher: <code>{matcher.matcher}</code>
                      </h5>
                      <div className="hook-commands">
                        {matcher.hooks.map((hook) => (
                          <div
                            key={`${hook.type}-${hook.command}`}
                            className="hook-command"
                          >
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
          </div>

          <div className="settings-section">
            <h3>Raw Settings JSON</h3>
            <div className="json-viewer">
              <pre>{JSON.stringify(settings, null, 2)}</pre>
            </div>
          </div>
        </div>
      )}
    </div>
  );
};
