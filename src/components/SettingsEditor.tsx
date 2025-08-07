import { type FC, useCallback, useEffect, useState } from "react";
import { api } from "../api";
import type { ClaudeSettings } from "../types";
import { SettingsFilesEditor } from "./SettingsFilesEditor";
import { CommandsAgentsEditor } from "./CommandsAgentsEditor";
import { SafeCode, SafeJSON } from "../utils/security";
import { ErrorBoundary } from "./ErrorBoundary";
import { ImprovedSettingsEditor } from "./improved/ImprovedSettingsEditor";
import { isImprovedSettingsEnabled } from "../utils/improvedSettings";

type SettingsTab = "permissions" | "files" | "commands-agents";

/**
 * Check if improved settings UI should be used
 * Default to improved UI for better user experience
 */
const useImprovedUI = (): boolean => {
  // Check URL parameter for legacy fallback
  const urlParams = new URLSearchParams(window.location.search);
  if (urlParams.get("legacy-settings") === "true") {
    return false;
  }

  // Check localStorage flag for legacy fallback
  const storageFlag = localStorage.getItem("claude-legacy-settings");
  if (storageFlag === "true") {
    return false;
  }

  // Default to improved UI
  return true;
};

export const SettingsEditor: FC = () => {
  const shouldUseImprovedUI = useImprovedUI();

  // If improved UI is enabled, render the new component
  if (shouldUseImprovedUI) {
    return (
      <ErrorBoundary>
        <ImprovedSettingsEditor />
      </ErrorBoundary>
    );
  }

  // Original implementation continues below
  const [settings, setSettings] = useState<ClaudeSettings | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [activeTab, setActiveTab] = useState<SettingsTab>("permissions");

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

  const renderTabContent = () => {
    switch (activeTab) {
      case "permissions":
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

        if (loading) {
          return <div className="loading">Loading settings...</div>;
        }

        if (!settings) {
          return <div className="no-settings">No settings found</div>;
        }

        return (
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
                        <SafeCode content={item} />
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
                        <SafeCode content={item} />
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
                          Matcher: <SafeCode content={matcher.matcher} />
                        </h5>
                        <div className="hook-commands">
                          {matcher.hooks.map((hook) => (
                            <div
                              key={`${hook.type}-${hook.command}`}
                              className="hook-command"
                            >
                              <div className="hook-type">Type: {hook.type}</div>
                              <div className="hook-command-text">
                                <SafeCode content={hook.command} />
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
                <SafeJSON data={settings} />
              </div>
            </div>
          </div>
        );

      case "files":
        return (
          <ErrorBoundary>
            <SettingsFilesEditor />
          </ErrorBoundary>
        );

      case "commands-agents":
        return (
          <ErrorBoundary>
            <CommandsAgentsEditor />
          </ErrorBoundary>
        );

      default:
        return null;
    }
  };

  return (
    <div className="settings-editor">
      <div className="settings-editor-header">
        <h2>Settings</h2>
      </div>

      <div className="settings-tabs">
        <button
          className={`settings-tab ${activeTab === "permissions" ? "active" : ""}`}
          onClick={() => setActiveTab("permissions")}
        >
          Permissions & Hooks
        </button>
        <button
          className={`settings-tab ${activeTab === "files" ? "active" : ""}`}
          onClick={() => setActiveTab("files")}
        >
          Configuration Files
        </button>
        <button
          className={`settings-tab ${activeTab === "commands-agents" ? "active" : ""}`}
          onClick={() => setActiveTab("commands-agents")}
        >
          Commands & Agents
        </button>
      </div>

      <div className="settings-tab-content">{renderTabContent()}</div>
    </div>
  );
};
