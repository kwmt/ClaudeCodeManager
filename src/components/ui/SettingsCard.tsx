import React, { type ReactNode, type HTMLAttributes } from "react";

/**
 * Props for the SettingsCard component
 */
export interface SettingsCardProps extends HTMLAttributes<HTMLDivElement> {
  /** Card title displayed in the header */
  title?: string;
  /** Optional description text displayed below the title */
  description?: string;
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
  /** Optional action buttons or controls for the card header */
  headerActions?: ReactNode;
}

/**
 * SettingsCard - A Firebase-inspired card component for settings sections
 *
 * Features:
 * - Clean, modern card design with proper spacing and shadows
 * - Optional header with title, description, and actions
 * - Support for loading and error states
 * - Responsive design with proper focus management
 * - Accessible with proper ARIA attributes
 *
 * @example
 * ```tsx
 * <SettingsCard
 *   title="Permissions"
 *   description="Manage command permissions and access controls"
 *   headerActions={<Button>Edit</Button>}
 * >
 *   <PermissionsList />
 * </SettingsCard>
 * ```
 */
export const SettingsCard: React.FC<SettingsCardProps> = React.memo(
  ({
    title,
    description,
    children,
    compact = false,
    className = "",
    elevated = false,
    loading = false,
    error,
    headerActions,
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
        aria-describedby={description ? `${title}-description` : undefined}
        {...props}
      >
        {(title || description || headerActions) && (
          <div className="settings-card__header">
            <div className="settings-card__header-content">
              {title && <h3 className="settings-card__title">{title}</h3>}
              {description && (
                <p
                  className="settings-card__description"
                  id={title ? `${title}-description` : undefined}
                >
                  {description}
                </p>
              )}
            </div>
            {headerActions && (
              <div className="settings-card__header-actions">
                {headerActions}
              </div>
            )}
          </div>
        )}

        <div className="settings-card__body">
          {loading ? (
            <div
              className="settings-card__loading"
              role="status"
              aria-label="Loading"
            >
              <div className="settings-card__spinner" />
              <span className="settings-card__loading-text">Loading...</span>
            </div>
          ) : error ? (
            <div className="settings-card__error">
              <div className="settings-card__error-icon" aria-hidden="true">
                ⚠️
              </div>
              <div className="settings-card__error-content">
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
