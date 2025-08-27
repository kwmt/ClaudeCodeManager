import React, { type FC, useState, useCallback, useMemo } from "react";
import type { ClaudeSettings } from "../../types";
import { SettingsCard } from "../ui/SettingsCard";
import { SettingsSection, useSettingsSections } from "../ui/SettingsSection";

interface ImprovedPermissionsTabProps {
  settings: ClaudeSettings | null;
  loading: boolean;
  error: string | null;
  onRetry: () => void;
}

/**
 * Improved Permissions Tab with Progressive Disclosure
 *
 * Features:
 * - Hierarchical information structure (Basic → Advanced → Developer)
 * - Collapsible sections with smart defaults
 * - Visual priority indicators
 * - Enhanced accessibility
 * - Better error handling and empty states
 *
 * @example
 * ```tsx
 * <ImprovedPermissionsTab
 *   settings={settings}
 *   loading={loading}
 *   error={error}
 *   onRetry={loadSettings}
 * />
 * ```
 */
export const ImprovedPermissionsTab: FC<ImprovedPermissionsTabProps> =
  React.memo(({ settings, loading, error, onRetry }) => {
    const [showDeveloperMode, setShowDeveloperMode] = useState(false);

    // Manage section expanded states with smart defaults
    const sectionIds = [
      "permissions-basic",
      "permissions-lists",
      "hooks",
      "raw-json",
    ];
    const { toggleSection, isExpanded } = useSettingsSections(sectionIds, {
      "permissions-basic": true, // Always show basic info
      "permissions-lists": false, // Collapsed by default
      hooks: false, // Collapsed by default (advanced)
      "raw-json": false, // Developer mode only
    });

    const toggleDeveloperMode = useCallback(() => {
      setShowDeveloperMode((prev) => !prev);
    }, []);

    // Calculate summary statistics
    const summaryStats = useMemo(() => {
      if (!settings) return null;

      return {
        totalAllowedCommands: settings.permissions.allow.length,
        totalDeniedCommands: settings.permissions.deny.length,
        totalHooks: settings.hooks.PreToolUse.reduce(
          (sum, matcher) => sum + matcher.hooks.length,
          0,
        ),
        totalMatchers: settings.hooks.PreToolUse.length,
      };
    }, [settings]);

    // Show loading state
    if (loading) {
      return (
        <SettingsCard loading={true}>
          <div>Loading permissions...</div>
        </SettingsCard>
      );
    }

    // Show error state
    if (error) {
      return (
        <SettingsCard error={error}>
          <div className="settings-error-state">
            <p>Failed to load permissions and hooks configuration.</p>
            <button
              type="button"
              onClick={onRetry}
              className="settings-button settings-button--primary"
            >
              Retry
            </button>
          </div>
        </SettingsCard>
      );
    }

    // Show empty state
    if (!settings) {
      return (
        <SettingsCard>
          <div className="settings-empty-state">
            <div className="settings-empty-state__icon">📋</div>
            <h2 className="settings-empty-state__title">No Settings Found</h2>
            <p className="settings-empty-state__description">
              No permissions or hooks configuration could be found.
            </p>
            <button
              type="button"
              onClick={onRetry}
              className="settings-button settings-button--primary"
            >
              Reload Settings
            </button>
          </div>
        </SettingsCard>
      );
    }

    return (
      <div className="improved-permissions-tab">
        {/* Permissions & Hooks Settings */}
        <SettingsCard>
          {/* Developer Mode Toggle */}
          <div style={{ marginBottom: "var(--spacing-4)" }}>
            <button
              type="button"
              onClick={toggleDeveloperMode}
              className="settings-button settings-button--secondary"
              aria-pressed={showDeveloperMode}
            >
              {showDeveloperMode ? "Hide" : "Show"} Developer Mode
            </button>
          </div>
          {/* Permission Summary */}
          <SettingsSection
            title="Permission Summary"
            collapsible={false}
            priority="high"
            icon={
              <svg
                width="20"
                height="20"
                viewBox="0 0 20 20"
                fill="currentColor"
              >
                <path
                  fillRule="evenodd"
                  d="M3 4a1 1 0 011-1h12a1 1 0 110 2H4a1 1 0 01-1-1zm0 4a1 1 0 011-1h12a1 1 0 110 2H4a1 1 0 01-1-1zm0 4a1 1 0 011-1h12a1 1 0 110 2H4a1 1 0 01-1-1zm0 4a1 1 0 011-1h12a1 1 0 110 2H4a1 1 0 01-1-1z"
                  clipRule="evenodd"
                />
              </svg>
            }
          >
            <div className="permissions-summary">
              <div className="permissions-summary-grid">
                <div className="permissions-summary-item">
                  <div className="permissions-summary-item__icon">🔧</div>
                  <div className="permissions-summary-item__content">
                    <div className="permissions-summary-item__label">
                      Default Mode
                    </div>
                    <div className="permissions-summary-item__value">
                      <code className="permission-mode">
                        {settings.permissions.defaultMode}
                      </code>
                    </div>
                  </div>
                </div>

                <div className="permissions-summary-item">
                  <div className="permissions-summary-item__icon">✅</div>
                  <div className="permissions-summary-item__content">
                    <div className="permissions-summary-item__label">
                      Allowed Commands
                    </div>
                    <div className="permissions-summary-item__value">
                      {summaryStats?.totalAllowedCommands || 0}
                    </div>
                  </div>
                </div>

                <div className="permissions-summary-item">
                  <div className="permissions-summary-item__icon">❌</div>
                  <div className="permissions-summary-item__content">
                    <div className="permissions-summary-item__label">
                      Denied Commands
                    </div>
                    <div className="permissions-summary-item__value">
                      {summaryStats?.totalDeniedCommands || 0}
                    </div>
                  </div>
                </div>

                <div className="permissions-summary-item">
                  <div className="permissions-summary-item__icon">🪝</div>
                  <div className="permissions-summary-item__content">
                    <div className="permissions-summary-item__label">
                      Total Hooks
                    </div>
                    <div className="permissions-summary-item__value">
                      {summaryStats?.totalHooks || 0}
                    </div>
                  </div>
                </div>
              </div>
            </div>
          </SettingsSection>

          {/* Detailed Permission Lists */}
          <SettingsSection
            title="Command Lists"
            description="Detailed view of allowed and denied commands"
            defaultExpanded={isExpanded("permissions-lists")}
            onExpandedChange={(expanded) =>
              !expanded || toggleSection("permissions-lists")
            }
            priority="medium"
            badge={
              <span className="section-badge">
                {(summaryStats?.totalAllowedCommands || 0) +
                  (summaryStats?.totalDeniedCommands || 0)}
              </span>
            }
            icon={
              <svg
                width="20"
                height="20"
                viewBox="0 0 20 20"
                fill="currentColor"
              >
                <path
                  fillRule="evenodd"
                  d="M3 4a1 1 0 011-1h12a1 1 0 110 2H4a1 1 0 01-1-1zm0 4a1 1 0 011-1h12a1 1 0 110 2H4a1 1 0 01-1-1zm0 4a1 1 0 011-1h12a1 1 0 110 2H4a1 1 0 01-1-1zm0 4a1 1 0 011-1h12a1 1 0 110 2H4a1 1 0 01-1-1z"
                  clipRule="evenodd"
                />
              </svg>
            }
          >
            <div className="permission-lists">
              <div className="permission-group">
                <h4 className="permission-group__title permission-group__title--allow">
                  Allowed Commands
                  <span className="permission-count">
                    ({settings.permissions.allow.length})
                  </span>
                </h4>
                {settings.permissions.allow.length === 0 ? (
                  <div className="permission-empty-state">
                    <p className="permission-empty-message">
                      No allowed commands specified
                    </p>
                    <p className="permission-empty-help">
                      Commands will be handled according to the default mode
                    </p>
                  </div>
                ) : (
                  <ul className="permission-list permission-list--allow">
                    {settings.permissions.allow.map((item, index) => (
                      <li
                        key={`allow-${index}`}
                        className="permission-list-item"
                      >
                        <code className="permission-command">{item}</code>
                      </li>
                    ))}
                  </ul>
                )}
              </div>

              <div className="permission-group">
                <h4 className="permission-group__title permission-group__title--deny">
                  Denied Commands
                  <span className="permission-count">
                    ({settings.permissions.deny.length})
                  </span>
                </h4>
                {settings.permissions.deny.length === 0 ? (
                  <div className="permission-empty-state">
                    <p className="permission-empty-message">
                      No denied commands specified
                    </p>
                    <p className="permission-empty-help">
                      Commands will be handled according to the default mode
                    </p>
                  </div>
                ) : (
                  <ul className="permission-list permission-list--deny">
                    {settings.permissions.deny.map((item, index) => (
                      <li
                        key={`deny-${index}`}
                        className="permission-list-item"
                      >
                        <code className="permission-command">{item}</code>
                      </li>
                    ))}
                  </ul>
                )}
              </div>
            </div>
          </SettingsSection>

          {/* Hooks Configuration - Advanced */}
          <SettingsSection
            title="Pre-Tool Use Hooks"
            description="Advanced automation hooks that run before tool execution"
            defaultExpanded={isExpanded("hooks")}
            onExpandedChange={(expanded) => !expanded || toggleSection("hooks")}
            priority="low"
            badge={
              <span className="section-badge section-badge--advanced">
                {summaryStats?.totalMatchers || 0}
              </span>
            }
            icon={
              <svg
                width="20"
                height="20"
                viewBox="0 0 20 20"
                fill="currentColor"
              >
                <path
                  fillRule="evenodd"
                  d="M12.316 3.051a1 1 0 01.633 1.265l-4 12a1 1 0 11-1.898-.632l4-12a1 1 0 011.265-.633zM5.707 6.293a1 1 0 010 1.414L3.414 10l2.293 2.293a1 1 0 11-1.414 1.414l-3-3a1 1 0 010-1.414l3-3a1 1 0 011.414 0zm8.586 0a1 1 0 011.414 0l3 3a1 1 0 010 1.414l-3 3a1 1 0 11-1.414-1.414L16.586 10l-2.293-2.293a1 1 0 010-1.414z"
                  clipRule="evenodd"
                />
              </svg>
            }
          >
            <div className="hooks-configuration">
              {settings.hooks.PreToolUse.length === 0 ? (
                <div className="hooks-empty-state">
                  <div className="hooks-empty-state__icon">🪝</div>
                  <h4 className="hooks-empty-state__title">
                    No Hooks Configured
                  </h4>
                  <p className="hooks-empty-state__description">
                    Pre-tool use hooks allow you to run custom commands before
                    tool execution.
                  </p>
                </div>
              ) : (
                <div className="hooks-list">
                  {settings.hooks.PreToolUse.map((matcher, matcherIndex) => (
                    <div
                      key={`matcher-${matcherIndex}`}
                      className="hook-matcher"
                    >
                      <div className="hook-matcher__header">
                        <h5 className="hook-matcher__title">Matcher Pattern</h5>
                        <code className="hook-matcher__pattern">
                          {matcher.matcher}
                        </code>
                      </div>

                      <div className="hook-matcher__hooks">
                        <h6 className="hook-matcher__hooks-title">
                          Hooks ({matcher.hooks.length})
                        </h6>
                        <div className="hook-commands">
                          {matcher.hooks.map((hook, hookIndex) => (
                            <div
                              key={`hook-${matcherIndex}-${hookIndex}`}
                              className="hook-command"
                            >
                              <div className="hook-command__header">
                                <span className="hook-command__type">
                                  {hook.type}
                                </span>
                              </div>
                              <div className="hook-command__content">
                                <code className="hook-command__text">
                                  {hook.command}
                                </code>
                              </div>
                            </div>
                          ))}
                        </div>
                      </div>
                    </div>
                  ))}
                </div>
              )}
            </div>
          </SettingsSection>

          {/* Developer Mode - Raw JSON */}
          {showDeveloperMode && (
            <SettingsSection
              title="Raw Configuration (Developer Mode)"
              description="Complete JSON representation of the settings"
              defaultExpanded={false}
              priority="low"
              icon={
                <svg
                  width="20"
                  height="20"
                  viewBox="0 0 20 20"
                  fill="currentColor"
                >
                  <path
                    fillRule="evenodd"
                    d="M12.316 3.051a1 1 0 01.633 1.265l-4 12a1 1 0 11-1.898-.632l4-12a1 1 0 011.265-.633zM5.707 6.293a1 1 0 010 1.414L3.414 10l2.293 2.293a1 1 0 11-1.414 1.414l-3-3a1 1 0 010-1.414l3-3a1 1 0 011.414 0zm8.586 0a1 1 0 011.414 0l3 3a1 1 0 010 1.414l-3 3a1 1 0 11-1.414-1.414L16.586 10l-2.293-2.293a1 1 0 010-1.414z"
                    clipRule="evenodd"
                  />
                </svg>
              }
            >
              <div className="raw-json-viewer">
                <div className="raw-json-viewer__header">
                  <p className="raw-json-viewer__warning">
                    ⚠️ This is the raw configuration data. Modifying this
                    directly is not recommended.
                  </p>
                </div>
                <div className="raw-json-viewer__content">
                  <pre className="raw-json-viewer__code">
                    <code>{JSON.stringify(settings, null, 2)}</code>
                  </pre>
                </div>
              </div>
            </SettingsSection>
          )}
        </SettingsCard>
      </div>
    );
  });

export default ImprovedPermissionsTab;
