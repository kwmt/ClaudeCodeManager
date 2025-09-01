import React, { type FC, useState, useCallback, useMemo } from "react";
import type { ClaudeSettings } from "../../types";
import { SettingsCard } from "../ui/SettingsCard";
import { SettingsSection, useSettingsSections } from "../ui/SettingsSection";
import { EditablePermissions } from "./EditablePermissions";
import { EditableHooks } from "./EditableHooks";
import { api } from "../../api";

interface ImprovedPermissionsTabProps {
  settings: ClaudeSettings | null;
  loading: boolean;
  error: string | null;
  onRetry: () => void;
}

/**
 * Improved Permissions Tab with Progressive Disclosure and Edit Mode
 *
 * Features:
 * - Edit mode for modifying settings
 * - Save/Cancel functionality with validation
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
    const [isEditing, setIsEditing] = useState(false);
    const [editedSettings, setEditedSettings] = useState<ClaudeSettings | null>(
      null,
    );
    const [saveError, setSaveError] = useState<string | null>(null);
    const [isSaving, setIsSaving] = useState(false);
    const [saveSuccess, setSaveSuccess] = useState(false);

    // Manage section expanded states with smart defaults
    const sectionIds = [
      "permissions-basic",
      "permissions-lists",
      "hooks",
      "raw-json",
    ];
    const { toggleSection, isExpanded } = useSettingsSections(sectionIds, {
      "permissions-basic": true, // Always show basic info
      "permissions-lists": isEditing, // Expand when editing
      hooks: false, // Collapsed by default (advanced)
      "raw-json": false, // Developer mode only
    });

    const toggleDeveloperMode = useCallback(() => {
      setShowDeveloperMode((prev) => !prev);
    }, []);

    const startEditing = useCallback(() => {
      if (settings) {
        setEditedSettings(JSON.parse(JSON.stringify(settings)));
        setIsEditing(true);
        setSaveError(null);
        setSaveSuccess(false);
      }
    }, [settings]);

    const cancelEditing = useCallback(() => {
      setEditedSettings(null);
      setIsEditing(false);
      setSaveError(null);
      setSaveSuccess(false);
    }, []);

    const saveSettings = useCallback(async () => {
      if (!editedSettings) return;

      try {
        setIsSaving(true);
        setSaveError(null);
        await api.saveSettings(editedSettings);
        setSaveSuccess(true);
        setIsEditing(false);
        // Reload settings after successful save
        setTimeout(() => {
          onRetry();
          setSaveSuccess(false);
        }, 1500);
      } catch (err) {
        setSaveError(
          err instanceof Error ? err.message : "Failed to save settings",
        );
      } finally {
        setIsSaving(false);
      }
    }, [editedSettings, onRetry]);

    const handlePermissionsChange = useCallback(
      (permissions: ClaudeSettings["permissions"]) => {
        if (editedSettings) {
          setEditedSettings({
            ...editedSettings,
            permissions,
          });
        }
      },
      [editedSettings],
    );

    const handleHooksChange = useCallback(
      (hooks: ClaudeSettings["hooks"]) => {
        if (editedSettings) {
          setEditedSettings({
            ...editedSettings,
            hooks,
          });
        }
      },
      [editedSettings],
    );

    // Calculate summary statistics
    const summaryStats = useMemo(() => {
      const targetSettings = editedSettings || settings;
      if (!targetSettings) return null;

      return {
        totalAllowedCommands: targetSettings.permissions.allow.length,
        totalDeniedCommands: targetSettings.permissions.deny.length,
        totalHooks: targetSettings.hooks.PreToolUse.reduce(
          (sum, matcher) => sum + matcher.hooks.length,
          0,
        ),
        totalMatchers: targetSettings.hooks.PreToolUse.length,
      };
    }, [settings, editedSettings]);

    const hasChanges = useMemo(() => {
      if (!settings || !editedSettings) return false;
      return JSON.stringify(settings) !== JSON.stringify(editedSettings);
    }, [settings, editedSettings]);

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

    const currentSettings = editedSettings || settings;

    return (
      <div className="improved-permissions-tab">
        {/* Actions Bar */}
        <div className="settings-actions-bar">
          {!isEditing ? (
            <>
              <button
                type="button"
                onClick={startEditing}
                className="settings-button settings-button--primary"
              >
                Edit Settings
              </button>
              <button
                type="button"
                onClick={toggleDeveloperMode}
                className="settings-button settings-button--secondary"
                aria-pressed={showDeveloperMode}
              >
                {showDeveloperMode ? "Hide" : "Show"} Developer Mode
              </button>
            </>
          ) : (
            <>
              <button
                type="button"
                onClick={saveSettings}
                className="settings-button settings-button--success"
                disabled={isSaving || !hasChanges}
              >
                {isSaving ? "Saving..." : "Save Changes"}
              </button>
              <button
                type="button"
                onClick={cancelEditing}
                className="settings-button settings-button--secondary"
                disabled={isSaving}
              >
                Cancel
              </button>
              {hasChanges && (
                <span className="settings-status">
                  ✏️ {hasChanges ? "Unsaved changes" : ""}
                </span>
              )}
            </>
          )}
        </div>

        {/* Status Messages */}
        {saveError && (
          <div className="settings-alert settings-alert--error">
            <strong>Error:</strong> {saveError}
          </div>
        )}
        {saveSuccess && (
          <div className="settings-alert settings-alert--success">
            <strong>Success:</strong> Settings saved successfully!
          </div>
        )}

        {/* Permissions & Hooks Settings */}
        <SettingsCard>
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
                        {currentSettings.permissions.defaultMode}
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
            title="Command Permissions"
            description="Configure allowed and denied commands"
            defaultExpanded={isExpanded("permissions-lists") || isEditing}
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
            <EditablePermissions
              permissions={currentSettings.permissions}
              onChange={handlePermissionsChange}
              isEditing={isEditing}
            />
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
            <EditableHooks
              hooks={currentSettings.hooks}
              onChange={handleHooksChange}
              isEditing={isEditing}
            />
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
                    ⚠️ This is the raw configuration data.{" "}
                    {isEditing
                      ? "Shows current edits in real-time."
                      : "Use Edit Settings button to modify."}
                  </p>
                </div>
                <div className="raw-json-viewer__content">
                  <pre className="raw-json-viewer__code">
                    <code>{JSON.stringify(currentSettings, null, 2)}</code>
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
