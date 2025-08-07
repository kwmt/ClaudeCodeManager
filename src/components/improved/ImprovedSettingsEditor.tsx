import React, {
  type FC,
  useCallback,
  useEffect,
  useState,
  useMemo,
} from "react";
import { api } from "../../api";
import type { ClaudeSettings } from "../../types";
import { SettingsCard } from "../ui/SettingsCard";
import { SettingsTabContainer, type Tab } from "../ui/SettingsTabNavigation";
import { ImprovedPermissionsTab } from "./ImprovedPermissionsTab";
import { SettingsFilesEditor } from "../SettingsFilesEditor";
import { CommandsAgentsEditor } from "../CommandsAgentsEditor";

type SettingsTab = "permissions" | "files" | "commands-agents";

/**
 * Improved Settings Editor with Firebase-inspired design
 *
 * Features:
 * - Modern card-based layout with proper spacing and shadows
 * - Accessible tab navigation with keyboard support
 * - Progressive disclosure pattern for complex settings
 * - Improved error handling and loading states
 * - Responsive design with proper breakpoints
 * - Consistent visual hierarchy and typography
 *
 * @example
 * ```tsx
 * <ImprovedSettingsEditor />
 * ```
 */
export const ImprovedSettingsEditor: FC = React.memo(() => {
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
      console.error("Failed to load settings:", err);
      setError(err instanceof Error ? err.message : "Failed to load settings");
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    loadSettings();
  }, [loadSettings]);

  const tabs: Tab[] = useMemo(
    () => [
      {
        id: "permissions",
        label: "Permissions & Hooks",
        ariaLabel: "Configure command permissions and pre-tool use hooks",
        icon: (
          <svg width="20" height="20" viewBox="0 0 20 20" fill="currentColor">
            <path
              fillRule="evenodd"
              d="M5 9V7a5 5 0 0110 0v2a2 2 0 012 2v5a2 2 0 01-2 2H5a2 2 0 01-2-2v-5a2 2 0 012-2zm8-2v2H7V7a3 3 0 016 0z"
              clipRule="evenodd"
            />
          </svg>
        ),
        badge: settings ? (
          <span className="tab-badge">
            {settings.permissions.allow.length +
              settings.permissions.deny.length +
              settings.hooks.PreToolUse.length}
          </span>
        ) : null,
      },
      {
        id: "files",
        label: "Configuration Files",
        ariaLabel: "Manage Claude configuration files and directory structure",
        icon: (
          <svg width="20" height="20" viewBox="0 0 20 20" fill="currentColor">
            <path
              fillRule="evenodd"
              d="M4 4a2 2 0 012-2h4.586A2 2 0 0112 2.586L15.414 6A2 2 0 0116 7.414V16a2 2 0 01-2 2H6a2 2 0 01-2-2V4zm2 6a1 1 0 011-1h6a1 1 0 110 2H7a1 1 0 01-1-1zm1 3a1 1 0 100 2h6a1 1 0 100-2H7z"
              clipRule="evenodd"
            />
          </svg>
        ),
      },
      {
        id: "commands-agents",
        label: "Commands & Agents",
        ariaLabel: "Manage custom commands and agent configurations",
        icon: (
          <svg width="20" height="20" viewBox="0 0 20 20" fill="currentColor">
            <path
              fillRule="evenodd"
              d="M3 4a1 1 0 011-1h12a1 1 0 110 2H4a1 1 0 01-1-1zm0 4a1 1 0 011-1h12a1 1 0 110 2H4a1 1 0 01-1-1zm0 4a1 1 0 011-1h12a1 1 0 110 2H4a1 1 0 01-1-1zm0 4a1 1 0 011-1h12a1 1 0 110 2H4a1 1 0 01-1-1z"
              clipRule="evenodd"
            />
          </svg>
        ),
      },
    ],
    [settings],
  );

  const renderTabContent = useCallback(
    (tabId: string) => {
      switch (tabId) {
        case "permissions":
          return (
            <ImprovedPermissionsTab
              settings={settings}
              loading={loading}
              error={error}
              onRetry={loadSettings}
            />
          );

        case "files":
          return (
            <SettingsCard
              title="Configuration Files"
              description="Manage Claude configuration files and directory structure"
            >
              <SettingsFilesEditor />
            </SettingsCard>
          );

        case "commands-agents":
          return (
            <SettingsCard
              title="Commands & Agents"
              description="Manage custom commands and agent configurations"
            >
              <CommandsAgentsEditor />
            </SettingsCard>
          );

        default:
          return (
            <SettingsCard error="Unknown tab selected">
              <div>Invalid tab selection</div>
            </SettingsCard>
          );
      }
    },
    [settings, loading, error, loadSettings],
  );

  const handleTabChange = useCallback((tabId: string) => {
    setActiveTab(tabId as SettingsTab);
  }, []);

  return (
    <div className="improved-settings-editor">
      <div className="improved-settings-editor__header">
        <div className="improved-settings-editor__header-content">
          <h1 className="improved-settings-editor__title">Settings</h1>
          <p className="improved-settings-editor__description">
            Configure Claude Code Manager preferences and behavior
          </p>
        </div>

        {/* Header actions could go here */}
        <div className="improved-settings-editor__header-actions">
          {/* Future: Add refresh button, export/import settings, etc. */}
        </div>
      </div>

      <div className="improved-settings-editor__content">
        <SettingsTabContainer
          tabs={tabs}
          activeTab={activeTab}
          onTabChange={handleTabChange}
          tabNavigationProps={{
            variant: "underlined",
            size: "large",
            fullWidth: false,
          }}
          className="improved-settings-editor__tabs"
        >
          {renderTabContent}
        </SettingsTabContainer>
      </div>
    </div>
  );
});

export default ImprovedSettingsEditor;
