/**
 * Smart wrapper component for CommandHistory feature migration
 *
 * This component handles the transition between legacy and improved CommandHistory
 * with error boundaries, performance monitoring, and user feedback collection.
 */

import React, { Suspense, useState, useEffect, useCallback } from "react";
import { ErrorBoundary } from "./ErrorBoundary";
import {
  isImprovedCommandHistoryEnabled,
  getCurrentMigrationPhase,
  getAvailableFeatures,
  recordPerformanceMetric,
  recordAnalytics,
  shouldCollectFeedback,
  recordUserFeedback,
  triggerEmergencyRollback,
  type MigrationPhase,
} from "../utils/improvedCommandHistory";

// Lazy load components for better performance
const LegacyCommandHistory = React.lazy(() =>
  import("./CommandHistory").then((module) => ({
    default: module.CommandHistory,
  })),
);

const ImprovedCommandHistory = React.lazy(
  () => import("./improved/CommandHistory"),
);

// Loading skeleton component
const CommandHistorySkeleton: React.FC = () => (
  <div
    className="command-history-skeleton"
    role="status"
    aria-label="Loading command history"
  >
    <div className="skeleton-header">
      <div className="skeleton-title" />
      <div className="skeleton-actions" />
    </div>
    <div className="skeleton-content">
      {Array.from({ length: 5 }, (_, i) => (
        <div key={i} className="skeleton-item">
          <div className="skeleton-item-header" />
          <div className="skeleton-item-content" />
        </div>
      ))}
    </div>
    <style jsx>{`
      .command-history-skeleton {
        padding: 24px;
        background: var(--color-gray-50);
        min-height: 100vh;
        animation: pulse 1.5s ease-in-out infinite;
      }
      
      .skeleton-header {
        display: flex;
        justify-content: space-between;
        align-items: center;
        margin-bottom: 32px;
        padding-bottom: 24px;
        border-bottom: 1px solid var(--color-gray-200);
      }
      
      .skeleton-title {
        width: 200px;
        height: 32px;
        background: var(--color-gray-200);
        border-radius: 8px;
      }
      
      .skeleton-actions {
        width: 300px;
        height: 40px;
        background: var(--color-gray-200);
        border-radius: 8px;
      }
      
      .skeleton-content {
        display: flex;
        flex-direction: column;
        gap: 16px;
      }
      
      .skeleton-item {
        background: white;
        border: 1px solid var(--color-gray-200);
        border-radius: 12px;
        padding: 20px;
      }
      
      .skeleton-item-header {
        width: 50%;
        height: 16px;
        background: var(--color-gray-200);
        border-radius: 4px;
        margin-bottom: 12px;
      }
      
      .skeleton-item-content {
        width: 80%;
        height: 20px;
        background: var(--color-gray-200);
        border-radius: 4px;
      }
      
      @keyframes pulse {
        0%, 100% { opacity: 1; }
        50% { opacity: 0.7; }
      }
      
      @media (prefers-reduced-motion: reduce) {
        .command-history-skeleton {
          animation: none;
        }
      }
    `}</style>
  </div>
);

// User feedback modal component
interface UserFeedbackModalProps {
  version: "legacy" | "improved";
  onSubmit: (feedback: {
    rating: number;
    comment?: string;
    usabilityScore: number;
    featureUsage: string[];
  }) => void;
  onClose: () => void;
}

const UserFeedbackModal: React.FC<UserFeedbackModalProps> = ({
  version,
  onSubmit,
  onClose,
}) => {
  const [rating, setRating] = useState(3);
  const [comment, setComment] = useState("");
  const [usabilityScore, setUsabilityScore] = useState(3);
  const [featureUsage, setFeatureUsage] = useState<string[]>([]);

  const features = ["search", "export", "copy", "navigation", "mobile-use"];

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    onSubmit({
      rating,
      comment: comment.trim() || undefined,
      usabilityScore,
      featureUsage,
    });
    onClose();
  };

  const handleFeatureToggle = (feature: string) => {
    setFeatureUsage((prev) =>
      prev.includes(feature)
        ? prev.filter((f) => f !== feature)
        : [...prev, feature],
    );
  };

  return (
    <div className="feedback-modal-overlay" onClick={onClose}>
      <div className="feedback-modal" onClick={(e) => e.stopPropagation()}>
        <div className="feedback-modal-header">
          <h3>Help us improve CommandHistory</h3>
          <button
            type="button"
            className="feedback-modal-close"
            onClick={onClose}
            aria-label="Close feedback form"
          >
            ×
          </button>
        </div>

        <form onSubmit={handleSubmit}>
          <div className="feedback-field">
            <label htmlFor="overall-rating">
              Overall satisfaction (1 = Poor, 5 = Excellent)
            </label>
            <div className="rating-stars">
              {[1, 2, 3, 4, 5].map((star) => (
                <button
                  key={star}
                  type="button"
                  className={`star ${star <= rating ? "active" : ""}`}
                  onClick={() => setRating(star)}
                  aria-label={`Rate ${star} stars`}
                >
                  ★
                </button>
              ))}
            </div>
          </div>

          <div className="feedback-field">
            <label htmlFor="usability-score">
              How easy was it to use? (1 = Very hard, 5 = Very easy)
            </label>
            <div className="rating-stars">
              {[1, 2, 3, 4, 5].map((star) => (
                <button
                  key={star}
                  type="button"
                  className={`star ${star <= usabilityScore ? "active" : ""}`}
                  onClick={() => setUsabilityScore(star)}
                  aria-label={`Rate usability ${star} stars`}
                >
                  ★
                </button>
              ))}
            </div>
          </div>

          <div className="feedback-field">
            <label>Which features did you use? (Select all that apply)</label>
            <div className="feature-checkboxes">
              {features.map((feature) => (
                <label key={feature} className="checkbox-label">
                  <input
                    type="checkbox"
                    checked={featureUsage.includes(feature)}
                    onChange={() => handleFeatureToggle(feature)}
                  />
                  <span className="feature-name">
                    {feature
                      .replace("-", " ")
                      .replace(/\b\w/g, (l) => l.toUpperCase())}
                  </span>
                </label>
              ))}
            </div>
          </div>

          <div className="feedback-field">
            <label htmlFor="comment">Any additional feedback? (Optional)</label>
            <textarea
              id="comment"
              value={comment}
              onChange={(e) => setComment(e.target.value)}
              placeholder="Tell us what you liked or what could be improved..."
              rows={3}
              maxLength={500}
            />
            <div className="character-count">
              {comment.length}/500 characters
            </div>
          </div>

          <div className="feedback-actions">
            <button
              type="button"
              className="button button--secondary"
              onClick={onClose}
            >
              Skip
            </button>
            <button type="submit" className="button button--primary">
              Submit Feedback
            </button>
          </div>
        </form>

        <style jsx>{`
          .feedback-modal-overlay {
            position: fixed;
            top: 0;
            left: 0;
            right: 0;
            bottom: 0;
            background: rgba(0, 0, 0, 0.5);
            display: flex;
            align-items: center;
            justify-content: center;
            z-index: 1000;
            padding: 20px;
          }

          .feedback-modal {
            background: white;
            border-radius: 12px;
            box-shadow: 0 20px 25px -5px rgba(0, 0, 0, 0.1);
            max-width: 500px;
            width: 100%;
            max-height: 80vh;
            overflow-y: auto;
            animation: slideIn 0.3s ease-out;
          }

          .feedback-modal-header {
            display: flex;
            justify-content: space-between;
            align-items: center;
            padding: 24px 24px 0;
            border-bottom: 1px solid var(--color-gray-200);
            margin-bottom: 24px;
            padding-bottom: 16px;
          }

          .feedback-modal-header h3 {
            margin: 0;
            font-size: 20px;
            font-weight: 600;
            color: var(--color-gray-900);
          }

          .feedback-modal-close {
            background: none;
            border: none;
            font-size: 24px;
            color: var(--color-gray-400);
            cursor: pointer;
            padding: 4px;
            border-radius: 4px;
            transition: all 0.2s;
          }

          .feedback-modal-close:hover {
            color: var(--color-gray-600);
            background: var(--color-gray-100);
          }

          form {
            padding: 0 24px 24px;
          }

          .feedback-field {
            margin-bottom: 20px;
          }

          .feedback-field label {
            display: block;
            font-weight: 500;
            color: var(--color-gray-700);
            margin-bottom: 8px;
            font-size: 14px;
          }

          .rating-stars {
            display: flex;
            gap: 4px;
          }

          .star {
            background: none;
            border: none;
            font-size: 24px;
            color: var(--color-gray-300);
            cursor: pointer;
            transition: color 0.2s;
            padding: 4px;
          }

          .star.active,
          .star:hover {
            color: var(--color-primary-500);
          }

          .feature-checkboxes {
            display: grid;
            grid-template-columns: repeat(auto-fit, minmax(150px, 1fr));
            gap: 12px;
            margin-top: 8px;
          }

          .checkbox-label {
            display: flex;
            align-items: center;
            gap: 8px;
            cursor: pointer;
            padding: 8px;
            border-radius: 6px;
            transition: background-color 0.2s;
          }

          .checkbox-label:hover {
            background: var(--color-gray-50);
          }

          .checkbox-label input[type="checkbox"] {
            margin: 0;
          }

          .feature-name {
            font-size: 14px;
            color: var(--color-gray-700);
          }

          textarea {
            width: 100%;
            padding: 12px;
            border: 1px solid var(--color-gray-300);
            border-radius: 6px;
            font-size: 14px;
            font-family: inherit;
            resize: vertical;
            min-height: 80px;
          }

          textarea:focus {
            outline: none;
            border-color: var(--color-primary-500);
            box-shadow: 0 0 0 3px var(--color-primary-100);
          }

          .character-count {
            text-align: right;
            font-size: 12px;
            color: var(--color-gray-500);
            margin-top: 4px;
          }

          .feedback-actions {
            display: flex;
            gap: 12px;
            justify-content: flex-end;
            margin-top: 24px;
          }

          .button {
            padding: 10px 20px;
            border-radius: 6px;
            font-size: 14px;
            font-weight: 500;
            cursor: pointer;
            transition: all 0.2s;
            border: 1px solid transparent;
          }

          .button--secondary {
            background: var(--color-gray-100);
            color: var(--color-gray-700);
            border-color: var(--color-gray-300);
          }

          .button--secondary:hover {
            background: var(--color-gray-200);
          }

          .button--primary {
            background: var(--color-primary-600);
            color: white;
          }

          .button--primary:hover {
            background: var(--color-primary-700);
          }

          @keyframes slideIn {
            from {
              opacity: 0;
              transform: translateY(-20px);
            }
            to {
              opacity: 1;
              transform: translateY(0);
            }
          }

          @media (max-width: 640px) {
            .feedback-modal {
              margin: 20px;
              max-height: calc(100vh - 40px);
            }

            .feature-checkboxes {
              grid-template-columns: 1fr;
            }

            .feedback-actions {
              flex-direction: column-reverse;
            }

            .button {
              width: 100%;
            }
          }
        `}</style>
      </div>
    </div>
  );
};

// Development info banner
const DevelopmentBanner: React.FC<{
  phase: MigrationPhase;
  version: "legacy" | "improved";
  features: string[];
}> = ({ phase, version, features }) => {
  const [isExpanded, setIsExpanded] = useState(false);

  if (process.env.NODE_ENV !== "development") {
    return null;
  }

  return (
    <div className="dev-banner">
      <div className="dev-banner-content">
        <div className="dev-banner-header">
          <span className="dev-badge">DEV</span>
          <span className="dev-info">
            CommandHistory: <strong>{version.toUpperCase()}</strong> | Phase:{" "}
            <strong>{phase}</strong>
          </span>
          <button
            type="button"
            onClick={() => setIsExpanded(!isExpanded)}
            className="dev-toggle"
            aria-label={isExpanded ? "Collapse details" : "Expand details"}
          >
            {isExpanded ? "−" : "+"}
          </button>
        </div>

        {isExpanded && (
          <div className="dev-banner-details">
            <div className="dev-features">
              <strong>Available features:</strong> {features.join(", ")}
            </div>
            <div className="dev-controls">
              <strong>Console commands:</strong>
              <code>claudeCommands.enable()</code> |
              <code>claudeCommands.disable()</code> |
              <code>claudeCommands.getStatus()</code>
            </div>
          </div>
        )}
      </div>

      <style jsx>{`
        .dev-banner {
          background: linear-gradient(90deg, #f59e0b, #d97706);
          color: white;
          font-size: 12px;
          box-shadow: 0 2px 4px rgba(0, 0, 0, 0.1);
          z-index: 999;
        }

        .dev-banner-content {
          max-width: 1200px;
          margin: 0 auto;
          padding: 8px 16px;
        }

        .dev-banner-header {
          display: flex;
          align-items: center;
          gap: 12px;
        }

        .dev-badge {
          background: rgba(255, 255, 255, 0.2);
          padding: 2px 6px;
          border-radius: 4px;
          font-weight: 600;
          font-size: 10px;
        }

        .dev-info {
          flex: 1;
        }

        .dev-toggle {
          background: none;
          border: none;
          color: white;
          font-size: 16px;
          cursor: pointer;
          padding: 2px 6px;
          border-radius: 4px;
          transition: background-color 0.2s;
        }

        .dev-toggle:hover {
          background: rgba(255, 255, 255, 0.1);
        }

        .dev-banner-details {
          margin-top: 8px;
          padding-top: 8px;
          border-top: 1px solid rgba(255, 255, 255, 0.2);
          display: flex;
          flex-direction: column;
          gap: 4px;
        }

        .dev-features,
        .dev-controls {
          line-height: 1.4;
        }

        .dev-controls code {
          background: rgba(255, 255, 255, 0.1);
          padding: 1px 4px;
          border-radius: 2px;
          margin: 0 2px;
          font-size: 11px;
        }

        @media (max-width: 768px) {
          .dev-banner-header {
            flex-wrap: wrap;
          }
          
          .dev-banner-details {
            font-size: 11px;
          }
        }
      `}</style>
    </div>
  );
};

// Main wrapper component
export const CommandHistoryWrapper: React.FC = () => {
  const [showFeedbackModal, setShowFeedbackModal] = useState(false);
  const [renderStartTime, setRenderStartTime] = useState<number>(0);

  const useImproved = isImprovedCommandHistoryEnabled();
  const currentPhase = getCurrentMigrationPhase();
  const availableFeatures = getAvailableFeatures();

  useEffect(() => {
    const startTime = performance.now();
    setRenderStartTime(startTime);

    // Record render completion time
    const recordRenderTime = () => {
      const renderTime = performance.now() - startTime;
      recordPerformanceMetric("renderTime", renderTime);
    };

    // Use setTimeout to record after React has finished rendering
    const timer = setTimeout(recordRenderTime, 0);

    return () => clearTimeout(timer);
  }, [useImproved]);

  useEffect(() => {
    // Show feedback modal to selected users after 30 seconds
    if (shouldCollectFeedback()) {
      const timer = setTimeout(() => {
        setShowFeedbackModal(true);
      }, 30000);

      return () => clearTimeout(timer);
    }
  }, []);

  useEffect(() => {
    // Record analytics data on mount
    recordAnalytics({
      userExperience: {
        tasksCompleted: 0,
        timeSpent: 0,
        clickCount: 0,
        searchQueries: 0,
      },
      accessibility: {
        keyboardNavigation: false,
        screenReader: !!window.navigator.userAgent.match(
          /screen reader|NVDA|JAWS|VoiceOver/i,
        ),
        highContrast: window.matchMedia("(prefers-contrast: high)").matches,
      },
    });
  }, []);

  const handleFeedbackSubmit = useCallback(
    (feedback: {
      rating: number;
      comment?: string;
      usabilityScore: number;
      featureUsage: string[];
    }) => {
      recordUserFeedback(feedback);
    },
    [],
  );

  const handleError = useCallback(
    (error: Error, errorInfo: any) => {
      console.error("CommandHistory error:", error, errorInfo);

      // Record error and trigger rollback if using improved version
      if (useImproved) {
        triggerEmergencyRollback(`Component error: ${error.message}`);
      }

      recordAnalytics({
        performance: {
          searchResponseTime: 0,
          renderTime: 0,
          memoryUsage: 0,
          errorCount: 1,
        },
      });
    },
    [useImproved],
  );

  const ErrorFallback = useCallback(
    ({ error, resetError }: { error: Error; resetError: () => void }) => (
      <div className="command-history-error" role="alert">
        <div className="error-content">
          <div className="error-icon">⚠️</div>
          <h2>Something went wrong with CommandHistory</h2>
          <p>
            {useImproved
              ? "We've automatically switched back to the stable version. Please refresh the page."
              : "There was an error loading the command history. Please try refreshing the page."}
          </p>
          <details
            style={{ marginTop: "16px", fontSize: "14px", color: "#666" }}
          >
            <summary>Technical details</summary>
            <pre
              style={{
                marginTop: "8px",
                padding: "12px",
                background: "#f5f5f5",
                borderRadius: "4px",
                fontSize: "12px",
                overflow: "auto",
              }}
            >
              {error.message}
            </pre>
          </details>
          <div className="error-actions">
            <button onClick={resetError} className="button button--primary">
              Try Again
            </button>
            <button
              onClick={() => window.location.reload()}
              className="button button--secondary"
            >
              Refresh Page
            </button>
          </div>
        </div>

        <style jsx>{`
        .command-history-error {
          display: flex;
          align-items: center;
          justify-content: center;
          min-height: 400px;
          padding: 40px 20px;
          background: var(--color-gray-50);
        }

        .error-content {
          text-align: center;
          max-width: 500px;
        }

        .error-icon {
          font-size: 48px;
          margin-bottom: 16px;
        }

        .error-content h2 {
          color: var(--color-gray-900);
          margin: 0 0 12px 0;
          font-size: 24px;
          font-weight: 600;
        }

        .error-content p {
          color: var(--color-gray-600);
          margin: 0 0 20px 0;
          line-height: 1.5;
        }

        .error-actions {
          display: flex;
          gap: 12px;
          justify-content: center;
          margin-top: 24px;
        }

        .button {
          padding: 10px 20px;
          border-radius: 6px;
          font-size: 14px;
          font-weight: 500;
          cursor: pointer;
          transition: all 0.2s;
          border: 1px solid transparent;
        }

        .button--primary {
          background: var(--color-primary-600);
          color: white;
        }

        .button--primary:hover {
          background: var(--color-primary-700);
        }

        .button--secondary {
          background: var(--color-gray-100);
          color: var(--color-gray-700);
          border-color: var(--color-gray-300);
        }

        .button--secondary:hover {
          background: var(--color-gray-200);
        }
      `}</style>
      </div>
    ),
    [useImproved],
  );

  const Component = useImproved ? ImprovedCommandHistory : LegacyCommandHistory;

  return (
    <>
      <DevelopmentBanner
        phase={currentPhase}
        version={useImproved ? "improved" : "legacy"}
        features={availableFeatures}
      />

      <ErrorBoundary fallback={ErrorFallback} onError={handleError}>
        <Suspense fallback={<CommandHistorySkeleton />}>
          <Component />
        </Suspense>
      </ErrorBoundary>

      {showFeedbackModal && (
        <UserFeedbackModal
          version={useImproved ? "improved" : "legacy"}
          onSubmit={handleFeedbackSubmit}
          onClose={() => setShowFeedbackModal(false)}
        />
      )}
    </>
  );
};
