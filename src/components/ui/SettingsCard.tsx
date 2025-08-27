import React, { type ReactNode, type HTMLAttributes } from "react";

/**
 * Props for the SettingsCard component
 */
export interface SettingsCardProps extends HTMLAttributes<HTMLDivElement> {
  /** Child content to be rendered in the card body */
  children: ReactNode;
  /** Whether the card should have a compact layout with reduced padding */
  compact?: boolean;
  /** Additional CSS class names */
  className?: string;
  /** Whether the card should have elevated shadow styling */
  elevated?: boolean;
  /** Whether the card is in a loading state */
  loading?: boolean;
  /** Error message to display in case of an error state */
  error?: string;
}

/**
 * SettingsCard - A clean, modern card component for settings sections
 *
 * Features:
 * - Minimalist card design with proper spacing and shadows
 * - Support for loading and error states
 * - Responsive design with proper focus management
 * - Accessible with proper ARIA attributes
 * - Reduced visual clutter for better content focus
 *
 * @example
 * ```tsx
 * <SettingsCard>
 *   <PermissionsList />
 * </SettingsCard>
 * ```
 */
export const SettingsCard: React.FC<SettingsCardProps> = React.memo(
  ({
    children,
    compact = false,
    className = "",
    elevated = false,
    loading = false,
    error,
    ...props
  }) => {
    const cardClasses = [
      "settings-card",
      compact && "settings-card--compact",
      elevated && "settings-card--elevated",
      loading && "settings-card--loading",
      error && "settings-card--error",
      className,
    ]
      .filter(Boolean)
      .join(" ");

    return (
      <div
        className={cardClasses}
        role={error ? "alert" : undefined}
        {...props}
      >
        <div className="settings-card__body">
          {loading ? (
            <div
              className="settings-card__loading"
              role="status"
              aria-label="Loading"
            >
              <div className="settings-card__spinner" />
              <span className="settings-card__loading-text">
                Loading permissions...
              </span>
            </div>
          ) : error ? (
            <div className="settings-card__error">
              <div className="settings-card__error-icon" aria-hidden="true">
                ⚠️
              </div>
              <div className="settings-card__error-content">
                <h3 className="settings-card__error-title">
                  Failed to Load Settings
                </h3>
                <p className="settings-card__error-message">{error}</p>
              </div>
            </div>
          ) : (
            children
          )}
        </div>
      </div>
    );
  },
);

/**
 * Lightweight card variant without header for simple content grouping
 */
export const SettingsCardSimple: React.FC<{
  children: ReactNode;
  className?: string;
  compact?: boolean;
}> = React.memo(({ children, className = "", compact = false }) => (
  <div
    className={`settings-card ${compact ? "settings-card--compact" : ""} ${className}`}
  >
    <div className="settings-card__body">{children}</div>
  </div>
));

export default SettingsCard;
