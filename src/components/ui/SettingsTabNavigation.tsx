import React, {
  useCallback,
  useRef,
  useEffect,
  type ReactNode,
  type KeyboardEvent,
  type HTMLAttributes,
} from "react";

/**
 * Individual tab configuration
 */
export interface Tab {
  /** Unique identifier for the tab */
  id: string;
  /** Display label for the tab */
  label: string;
  /** Optional icon component */
  icon?: ReactNode;
  /** Optional badge content (e.g., count) */
  badge?: ReactNode;
  /** Whether the tab is disabled */
  disabled?: boolean;
  /** Additional description for accessibility */
  ariaLabel?: string;
}

/**
 * Props for the SettingsTabNavigation component
 */
export interface SettingsTabNavigationProps
  extends HTMLAttributes<HTMLDivElement> {
  /** Array of tab configurations */
  tabs: Tab[];
  /** Currently active tab ID */
  activeTab: string;
  /** Callback fired when a tab is selected */
  onTabChange: (tabId: string) => void;
  /** Additional CSS class names */
  className?: string;
  /** Whether tabs should take full width */
  fullWidth?: boolean;
  /** Visual variant of the tabs */
  variant?: "default" | "pills" | "underlined";
  /** Size of the tabs */
  size?: "small" | "medium" | "large";
}

/**
 * SettingsTabNavigation - An accessible tab navigation component
 *
 * Features:
 * - Full keyboard navigation (Arrow keys, Home, End, Enter, Space)
 * - ARIA compliant with proper roles and attributes
 * - Support for icons, badges, and disabled states
 * - Multiple visual variants
 * - Responsive design with overflow handling
 * - Focus management and visual indicators
 *
 * @example
 * ```tsx
 * const tabs = [
 *   { id: 'permissions', label: 'Permissions', icon: <ShieldIcon /> },
 *   { id: 'files', label: 'Files', badge: <span>3</span> },
 *   { id: 'commands', label: 'Commands & Agents' }
 * ];
 *
 * <SettingsTabNavigation
 *   tabs={tabs}
 *   activeTab={activeTab}
 *   onTabChange={setActiveTab}
 *   variant="underlined"
 * />
 * ```
 */
export const SettingsTabNavigation: React.FC<SettingsTabNavigationProps> =
  React.memo(
    ({
      tabs,
      activeTab,
      onTabChange,
      className = "",
      fullWidth = false,
      variant = "default",
      size = "medium",
      ...props
    }) => {
      const tabListRef = useRef<HTMLDivElement>(null);
      const activeTabIndex = tabs.findIndex((tab) => tab.id === activeTab);

      const focusTab = useCallback((index: number) => {
        const tabList = tabListRef.current;
        if (!tabList) return;

        const tabButtons = tabList.querySelectorAll(
          '[role="tab"]',
        ) as NodeListOf<HTMLButtonElement>;
        const targetButton = tabButtons[index];

        if (targetButton && !targetButton.disabled) {
          targetButton.focus();
        }
      }, []);

      const handleKeyDown = useCallback(
        (event: KeyboardEvent<HTMLDivElement>) => {
          const { key } = event;
          const currentIndex = activeTabIndex;
          const enabledIndices = tabs
            .map((tab, index) => (tab.disabled ? -1 : index))
            .filter((i) => i !== -1);

          let newIndex = currentIndex;

          switch (key) {
            case "ArrowLeft":
            case "ArrowUp":
              event.preventDefault();
              // Find previous enabled tab
              for (let i = enabledIndices.length - 1; i >= 0; i--) {
                if (enabledIndices[i] < currentIndex) {
                  newIndex = enabledIndices[i];
                  break;
                }
              }
              // If no previous tab found, wrap to last
              if (newIndex === currentIndex && enabledIndices.length > 0) {
                newIndex = enabledIndices[enabledIndices.length - 1];
              }
              break;

            case "ArrowRight":
            case "ArrowDown":
              event.preventDefault();
              // Find next enabled tab
              for (let i = 0; i < enabledIndices.length; i++) {
                if (enabledIndices[i] > currentIndex) {
                  newIndex = enabledIndices[i];
                  break;
                }
              }
              // If no next tab found, wrap to first
              if (newIndex === currentIndex && enabledIndices.length > 0) {
                newIndex = enabledIndices[0];
              }
              break;

            case "Home":
              event.preventDefault();
              newIndex = enabledIndices[0] ?? currentIndex;
              break;

            case "End":
              event.preventDefault();
              newIndex =
                enabledIndices[enabledIndices.length - 1] ?? currentIndex;
              break;

            case "Enter":
            case " ":
              event.preventDefault();
              // Activation is handled by the button click handler
              return;

            default:
              return;
          }

          if (newIndex !== currentIndex && newIndex >= 0) {
            focusTab(newIndex);
            onTabChange(tabs[newIndex].id);
          }
        },
        [tabs, activeTabIndex, onTabChange, focusTab],
      );

      const handleTabClick = useCallback(
        (tabId: string, disabled: boolean) => {
          if (disabled) return;
          onTabChange(tabId);
        },
        [onTabChange],
      );

      // Focus management when active tab changes externally
      useEffect(() => {
        if (
          document.activeElement?.closest('[role="tablist"]') ===
          tabListRef.current
        ) {
          focusTab(activeTabIndex);
        }
      }, [activeTab, activeTabIndex, focusTab]);

      const tabListClasses = [
        "settings-tab-navigation",
        `settings-tab-navigation--${variant}`,
        `settings-tab-navigation--${size}`,
        fullWidth && "settings-tab-navigation--full-width",
        className,
      ]
        .filter(Boolean)
        .join(" ");

      return (
        <div
          ref={tabListRef}
          className={tabListClasses}
          role="tablist"
          aria-orientation="horizontal"
          onKeyDown={handleKeyDown}
          {...props}
        >
          {tabs.map((tab) => {
            const isActive = tab.id === activeTab;
            const tabClasses = [
              "settings-tab-navigation__tab",
              isActive && "settings-tab-navigation__tab--active",
              tab.disabled && "settings-tab-navigation__tab--disabled",
            ]
              .filter(Boolean)
              .join(" ");

            return (
              <button
                key={tab.id}
                type="button"
                role="tab"
                className={tabClasses}
                aria-selected={isActive}
                aria-controls={`tabpanel-${tab.id}`}
                aria-label={tab.ariaLabel}
                id={`tab-${tab.id}`}
                tabIndex={isActive ? 0 : -1}
                disabled={tab.disabled}
                onClick={() => handleTabClick(tab.id, tab.disabled ?? false)}
              >
                <div className="settings-tab-navigation__tab-content">
                  {tab.icon && (
                    <div
                      className="settings-tab-navigation__tab-icon"
                      aria-hidden="true"
                    >
                      {tab.icon}
                    </div>
                  )}

                  <span className="settings-tab-navigation__tab-label">
                    {tab.label}
                  </span>

                  {tab.badge && (
                    <div
                      className="settings-tab-navigation__tab-badge"
                      aria-hidden="true"
                    >
                      {tab.badge}
                    </div>
                  )}
                </div>

                {/* Active indicator */}
                {isActive && (
                  <div
                    className="settings-tab-navigation__active-indicator"
                    aria-hidden="true"
                  />
                )}
              </button>
            );
          })}
        </div>
      );
    },
  );

/**
 * Tab panel component to wrap tab content
 */
export const SettingsTabPanel: React.FC<{
  tabId: string;
  activeTab: string;
  children: ReactNode;
  className?: string;
}> = React.memo(({ tabId, activeTab, children, className = "" }) => {
  const isActive = tabId === activeTab;

  return (
    <div
      role="tabpanel"
      id={`tabpanel-${tabId}`}
      aria-labelledby={`tab-${tabId}`}
      className={`settings-tab-panel ${className}`}
      hidden={!isActive}
      tabIndex={0}
    >
      {isActive && children}
    </div>
  );
});

/**
 * Composite component combining tab navigation and panels
 */
export const SettingsTabContainer: React.FC<{
  tabs: Tab[];
  activeTab: string;
  onTabChange: (tabId: string) => void;
  children: (tabId: string) => ReactNode;
  className?: string;
  tabNavigationProps?: Partial<SettingsTabNavigationProps>;
}> = React.memo(
  ({
    tabs,
    activeTab,
    onTabChange,
    children,
    className = "",
    tabNavigationProps = {},
  }) => (
    <div className={`settings-tab-container ${className}`}>
      <SettingsTabNavigation
        tabs={tabs}
        activeTab={activeTab}
        onTabChange={onTabChange}
        {...tabNavigationProps}
      />

      <div className="settings-tab-container__content">
        {tabs.map((tab) => (
          <SettingsTabPanel key={tab.id} tabId={tab.id} activeTab={activeTab}>
            {children(tab.id)}
          </SettingsTabPanel>
        ))}
      </div>
    </div>
  ),
);

export default SettingsTabNavigation;
