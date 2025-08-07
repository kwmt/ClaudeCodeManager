import React, { useState, useCallback } from "react";
import type { ClaudeSettings } from "../../types";

/**
 * Settings hierarchy configuration for progressive disclosure
 */
export interface SettingsPriority {
  essential: string[]; // Critical settings (always visible)
  common: string[]; // Frequently used (default visible)
  advanced: string[]; // Advanced settings (collapsible)
  developer: string[]; // Developer/debug settings (hidden by default)
}

export const settingsHierarchy: SettingsPriority = {
  essential: ["permissions.defaultMode"],
  common: ["permissions.allow", "permissions.deny"],
  advanced: ["hooks.PreToolUse"],
  developer: ["rawJson", "debug"],
};

/**
 * Settings section priority levels for visual prioritization
 */
export type SectionPriority = "high" | "medium" | "low";

export interface SettingsSection {
  id: string;
  title: string;
  description: string;
  icon: React.ReactNode;
  priority: SectionPriority;
  category: keyof SettingsPriority;
  badge?: number;
  collapsed?: boolean;
}

interface PrioritizedSettingsLayoutProps {
  settings: ClaudeSettings | null;
  children: (
    section: SettingsSection,
    settings: ClaudeSettings | null,
  ) => React.ReactNode;
}

/**
 * Component for managing settings layout with priority-based organization
 *
 * Features:
 * - Progressive disclosure of complexity
 * - Visual priority indicators
 * - Collapsible sections for advanced features
 * - Usage-based recommendations
 */
export const PrioritizedSettingsLayout: React.FC<
  PrioritizedSettingsLayoutProps
> = ({ settings, children }) => {
  const [collapsedSections, setCollapsedSections] = useState<Set<string>>(
    new Set(["developer"]), // Developer settings collapsed by default
  );
  const [showAdvanced, setShowAdvanced] = useState(false);

  const toggleSection = useCallback((sectionId: string) => {
    setCollapsedSections((prev) => {
      const newState = new Set(prev);
      if (newState.has(sectionId)) {
        newState.delete(sectionId);
      } else {
        newState.add(sectionId);
      }
      return newState;
    });
  }, []);

  const sections: SettingsSection[] = [
    {
      id: "permissions",
      title: "Permissions & Security",
      description: "Control command permissions and security policies",
      priority: "high",
      category: "essential",
      icon: (
        <svg width="20" height="20" viewBox="0 0 20 20" fill="currentColor">
          <path
            fillRule="evenodd"
            d="M5 9V7a5 5 0 0110 0v2a2 2 0 012 2v5a2 2 0 01-2 2H5a2 2 0 01-2-2v-5a2 2 0 012-2zm8-2v2H7V7a3 3 0 016 0z"
            clipRule="evenodd"
          />
        </svg>
      ),
      badge: settings
        ? settings.permissions.allow.length + settings.permissions.deny.length
        : 0,
      collapsed: collapsedSections.has("permissions"),
    },
    {
      id: "files",
      title: "Configuration Files",
      description: "Manage Claude configuration files and directory structure",
      priority: "medium",
      category: "common",
      icon: (
        <svg width="20" height="20" viewBox="0 0 20 20" fill="currentColor">
          <path
            fillRule="evenodd"
            d="M4 4a2 2 0 012-2h4.586A2 2 0 0112 2.586L15.414 6A2 2 0 0116 7.414V16a2 2 0 01-2 2H6a2 2 0 01-2-2V4zm2 6a1 1 0 011-1h6a1 1 0 110 2H7a1 1 0 01-1-1zm1 3a1 1 0 100 2h6a1 1 0 100-2H7z"
            clipRule="evenodd"
          />
        </svg>
      ),
      collapsed: collapsedSections.has("files"),
    },
    {
      id: "commands-agents",
      title: "Commands & Agents",
      description: "Manage custom commands and agent configurations",
      priority: "medium",
      category: "common",
      icon: (
        <svg width="20" height="20" viewBox="0 0 20 20" fill="currentColor">
          <path d="M13 6a3 3 0 11-6 0 3 3 0 016 0zM18 8a2 2 0 11-4 0 2 2 0 014 0zM14 15a4 4 0 00-8 0v3h8v-3z" />
        </svg>
      ),
      collapsed: collapsedSections.has("commands-agents"),
    },
    {
      id: "hooks",
      title: "Advanced Hooks",
      description: "Configure pre-tool use hooks and automation",
      priority: "low",
      category: "advanced",
      icon: (
        <svg width="20" height="20" viewBox="0 0 20 20" fill="currentColor">
          <path
            fillRule="evenodd"
            d="M11.3 1.046A1 1 0 0112 2v5h4a1 1 0 01.82 1.573l-7 10A1 1 0 018 18v-5H4a1 1 0 01-.82-1.573l7-10a1 1 0 011.12-.38z"
            clipRule="evenodd"
          />
        </svg>
      ),
      badge: settings?.hooks.PreToolUse.length || 0,
      collapsed: collapsedSections.has("hooks"),
    },
  ];

  // Add developer section if advanced mode is enabled
  if (showAdvanced) {
    sections.push({
      id: "developer",
      title: "Developer Settings",
      description: "Debug settings and raw configuration access",
      priority: "low",
      category: "developer",
      icon: (
        <svg width="20" height="20" viewBox="0 0 20 20" fill="currentColor">
          <path
            fillRule="evenodd"
            d="M12.316 3.051a1 1 0 01.633 1.265l-4 12a1 1 0 11-1.898-.632l4-12a1 1 0 011.265-.633zM5.707 6.293a1 1 0 010 1.414L3.414 10l2.293 2.293a1 1 0 11-1.414 1.414l-3-3a1 1 0 010-1.414l3-3a1 1 0 011.414 0zm8.586 0a1 1 0 011.414 0l3 3a1 1 0 010 1.414l-3 3a1 1 0 11-1.414-1.414L16.586 10l-2.293-2.293a1 1 0 010-1.414z"
            clipRule="evenodd"
          />
        </svg>
      ),
      collapsed: collapsedSections.has("developer"),
    });
  }

  return (
    <div className="prioritized-settings-layout">
      {/* Settings Organization Controls */}
      <div className="settings-organization-controls">
        <div className="organization-toggle">
          <label className="organization-toggle__label">
            <input
              type="checkbox"
              checked={showAdvanced}
              onChange={(e) => setShowAdvanced(e.target.checked)}
              className="organization-toggle__input"
            />
            <span className="organization-toggle__text">
              Show Developer Settings
            </span>
          </label>
        </div>
      </div>

      {/* Prioritized Sections */}
      <div className="settings-sections">
        {sections.map((section) => (
          <div
            key={section.id}
            className={`settings-section settings-section--priority-${section.priority} ${
              section.collapsed ? "settings-section--collapsed" : ""
            }`}
          >
            <button
              className="settings-section__header"
              onClick={() => toggleSection(section.id)}
              aria-expanded={!section.collapsed}
              aria-controls={`section-${section.id}`}
            >
              <div className="settings-section__header-content">
                <div className="settings-section__header-main">
                  <div className="settings-section__icon">{section.icon}</div>
                  <div className="settings-section__header-text">
                    <h3 className="settings-section__title">
                      {section.title}
                      {section.badge !== undefined && section.badge > 0 && (
                        <span className="settings-section__badge">
                          {section.badge}
                        </span>
                      )}
                    </h3>
                    <p className="settings-section__description">
                      {section.description}
                    </p>
                  </div>
                </div>
                <div className="settings-section__toggle">
                  <svg
                    className="settings-section__toggle-icon"
                    width="20"
                    height="20"
                    viewBox="0 0 20 20"
                    fill="currentColor"
                  >
                    <path
                      fillRule="evenodd"
                      d="M5.293 7.293a1 1 0 011.414 0L10 10.586l3.293-3.293a1 1 0 111.414 1.414l-4 4a1 1 0 01-1.414 0l-4-4a1 1 0 010-1.414z"
                      clipRule="evenodd"
                    />
                  </svg>
                </div>
              </div>
            </button>

            <div
              id={`section-${section.id}`}
              className="settings-section__content"
              role="region"
              aria-labelledby={`section-${section.id}-header`}
            >
              <div className="settings-section__content-inner">
                {children(section, settings)}
              </div>
            </div>
          </div>
        ))}
      </div>
    </div>
  );
};

export default PrioritizedSettingsLayout;
