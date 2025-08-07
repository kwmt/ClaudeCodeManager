import React, {
  useState,
  useCallback,
  type ReactNode,
  type HTMLAttributes,
  type KeyboardEvent,
} from "react";

/**
 * Props for the SettingsSection component
 */
export interface SettingsSectionProps extends HTMLAttributes<HTMLDivElement> {
  /** Section title */
  title: string;
  /** Optional description text */
  description?: string;
  /** Child content to be rendered in the collapsible section */
  children: ReactNode;
  /** Whether the section is initially expanded */
  defaultExpanded?: boolean;
  /** Whether the section can be collapsed */
  collapsible?: boolean;
  /** Additional CSS class names */
  className?: string;
  /** Callback fired when the expanded state changes */
  onExpandedChange?: (expanded: boolean) => void;
  /** Optional icon to display next to the title */
  icon?: ReactNode;
  /** Badge content to display in the header */
  badge?: ReactNode;
  /** Priority level for visual styling */
  priority?: "low" | "medium" | "high";
  /** Whether the section is in a disabled state */
  disabled?: boolean;
}

/**
 * SettingsSection - A collapsible section component implementing Progressive Disclosure
 *
 * Features:
 * - Collapsible content with smooth animations
 * - Keyboard navigation support (Enter, Space)
 * - Accessible with proper ARIA attributes
 * - Visual priority indicators
 * - Badge support for counts or status
 * - Icon support for visual categorization
 *
 * @example
 * ```tsx
 * <SettingsSection
 *   title="Advanced Configuration"
 *   description="Configure advanced settings and hooks"
 *   defaultExpanded={false}
 *   badge={<span className="badge">3</span>}
 *   priority="high"
 * >
 *   <AdvancedSettings />
 * </SettingsSection>
 * ```
 */
export const SettingsSection: React.FC<SettingsSectionProps> = React.memo(
  ({
    title,
    description,
    children,
    defaultExpanded = true,
    collapsible = true,
    className = "",
    onExpandedChange,
    icon,
    badge,
    priority = "medium",
    disabled = false,
    ...props
  }) => {
    const [isExpanded, setIsExpanded] = useState(defaultExpanded);

    const handleToggle = useCallback(() => {
      if (!collapsible || disabled) return;

      const newExpanded = !isExpanded;
      setIsExpanded(newExpanded);
      onExpandedChange?.(newExpanded);
    }, [isExpanded, collapsible, disabled, onExpandedChange]);

    const handleKeyDown = useCallback(
      (event: KeyboardEvent<HTMLElement>) => {
        if (!collapsible || disabled) return;

        if (event.key === "Enter" || event.key === " ") {
          event.preventDefault();
          handleToggle();
        }
      },
      [handleToggle, collapsible, disabled],
    );

    const sectionClasses = [
      "settings-section",
      `settings-section--priority-${priority}`,
      !isExpanded && "settings-section--collapsed",
      disabled && "settings-section--disabled",
      className,
    ]
      .filter(Boolean)
      .join(" ");

    const headerId = `settings-section-header-${title.replace(/\s+/g, "-").toLowerCase()}`;
    const contentId = `settings-section-content-${title.replace(/\s+/g, "-").toLowerCase()}`;

    return (
      <div className={sectionClasses} {...props}>
        <div
          className="settings-section__header"
          onClick={collapsible ? handleToggle : undefined}
          onKeyDown={collapsible ? handleKeyDown : undefined}
          role={collapsible ? "button" : undefined}
          tabIndex={collapsible && !disabled ? 0 : undefined}
          aria-expanded={collapsible ? isExpanded : undefined}
          aria-controls={collapsible ? contentId : undefined}
          aria-describedby={description ? `${headerId}-description` : undefined}
          id={headerId}
        >
          <div className="settings-section__header-content">
            <div className="settings-section__header-main">
              {icon && (
                <div className="settings-section__icon" aria-hidden="true">
                  {icon}
                </div>
              )}
              <div className="settings-section__header-text">
                <h4 className="settings-section__title">
                  {title}
                  {badge && (
                    <div className="settings-section__badge">{badge}</div>
                  )}
                </h4>
                {description && (
                  <p
                    className="settings-section__description"
                    id={`${headerId}-description`}
                  >
                    {description}
                  </p>
                )}
              </div>
            </div>

            {collapsible && (
              <div className="settings-section__toggle" aria-hidden="true">
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
            )}
          </div>
        </div>

        <div
          className="settings-section__content"
          id={contentId}
          aria-labelledby={headerId}
          role="region"
        >
          <div className="settings-section__content-inner">{children}</div>
        </div>
      </div>
    );
  },
);

/**
 * Simplified section component for non-collapsible content
 */
export const SettingsSectionSimple: React.FC<{
  title: string;
  description?: string;
  children: ReactNode;
  className?: string;
  priority?: "low" | "medium" | "high";
}> = React.memo(
  ({ title, description, children, className = "", priority = "medium" }) => (
    <SettingsSection
      title={title}
      description={description}
      collapsible={false}
      priority={priority}
      className={className}
    >
      {children}
    </SettingsSection>
  ),
);

/**
 * Hook for managing multiple sections' expanded states
 */
export const useSettingsSections = (
  sections: string[],
  defaultExpanded: Record<string, boolean> = {},
) => {
  const [expandedSections, setExpandedSections] = useState<
    Record<string, boolean>
  >(
    sections.reduce(
      (acc, section) => ({
        ...acc,
        [section]: defaultExpanded[section] ?? false,
      }),
      {},
    ),
  );

  const toggleSection = useCallback((sectionId: string) => {
    setExpandedSections((prev) => ({
      ...prev,
      [sectionId]: !prev[sectionId],
    }));
  }, []);

  const expandAll = useCallback(() => {
    setExpandedSections((prev) =>
      Object.keys(prev).reduce((acc, key) => ({ ...acc, [key]: true }), {}),
    );
  }, []);

  const collapseAll = useCallback(() => {
    setExpandedSections((prev) =>
      Object.keys(prev).reduce((acc, key) => ({ ...acc, [key]: false }), {}),
    );
  }, []);

  return {
    expandedSections,
    toggleSection,
    expandAll,
    collapseAll,
    isExpanded: (sectionId: string) => expandedSections[sectionId] ?? false,
  };
};

export default SettingsSection;
