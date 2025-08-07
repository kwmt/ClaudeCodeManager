/**
 * Error Boundary Component for Settings Editor
 *
 * SECURITY: Prevents error information leakage and provides graceful error handling
 */

import React, { Component, ErrorInfo, ReactNode } from "react";

interface Props {
  children: ReactNode;
  fallback?: ReactNode;
}

interface State {
  hasError: boolean;
  error?: Error;
  errorInfo?: ErrorInfo;
}

export class ErrorBoundary extends Component<Props, State> {
  constructor(props: Props) {
    super(props);
    this.state = { hasError: false };
  }

  static getDerivedStateFromError(error: Error): State {
    // Update state so the next render will show the fallback UI
    return { hasError: true, error };
  }

  componentDidCatch(error: Error, errorInfo: ErrorInfo) {
    // Log error details securely (avoid logging sensitive data)
    const sanitizedError = {
      message: error.message,
      stack: error.stack?.split("\n")[0], // Only first line to avoid stack trace leakage
      component: errorInfo.componentStack?.split("\n")[1], // Component that caused error
      timestamp: new Date().toISOString(),
    };

    console.error("Settings Editor Error:", sanitizedError);

    this.setState({
      error,
      errorInfo,
    });
  }

  handleReset = () => {
    this.setState({ hasError: false, error: undefined, errorInfo: undefined });
  };

  render() {
    if (this.state.hasError) {
      if (this.props.fallback) {
        return this.props.fallback;
      }

      return (
        <div className="error-boundary">
          <div className="error-boundary-content">
            <h2>設定エディタでエラーが発生しました</h2>
            <p>
              申し訳ございませんが、設定の編集中に予期しないエラーが発生しました。
            </p>

            <div className="error-actions">
              <button
                onClick={this.handleReset}
                className="btn-primary"
                type="button"
              >
                再試行
              </button>
              <button
                onClick={() => window.location.reload()}
                className="btn-secondary"
                type="button"
              >
                ページを再読み込み
              </button>
            </div>

            {process.env.NODE_ENV === "development" && this.state.error && (
              <details className="error-details">
                <summary>詳細情報 (開発モードのみ)</summary>
                <pre className="error-stack">
                  {this.state.error.message}
                  {this.state.errorInfo?.componentStack}
                </pre>
              </details>
            )}
          </div>
        </div>
      );
    }

    return this.props.children;
  }
}

// Error boundary styles (add to editors.css)
/**
 * Command History specific error fallback component
 */
export const CommandHistoryErrorFallback: React.FC<{
  error: Error;
  retry: () => void;
}> = ({ error, retry }) => (
  <div className="command-history-error">
    <h3>Command History Error</h3>
    <p>
      Failed to load command history. This might be due to a data parsing error
      or network issue.
    </p>
    <details className="error-details">
      <summary>Technical Details</summary>
      <pre className="error-message">{error.message}</pre>
    </details>
    <div className="error-actions">
      <button onClick={retry} className="retry-button">
        Retry Loading
      </button>
    </div>
  </div>
);

export const ErrorBoundaryStyles = `
.error-boundary {
  display: flex;
  align-items: center;
  justify-content: center;
  min-height: 400px;
  padding: 24px;
}

.error-boundary-content {
  text-align: center;
  max-width: 500px;
}

.error-boundary-content h2 {
  color: var(--error-color);
  margin-bottom: 16px;
}

.error-boundary-content p {
  margin-bottom: 24px;
  line-height: 1.5;
}

.error-actions {
  display: flex;
  gap: 12px;
  justify-content: center;
  margin-bottom: 24px;
}

.error-details {
  text-align: left;
  margin-top: 24px;
  border: 1px solid var(--border-color);
  border-radius: 4px;
  padding: 16px;
  background: var(--secondary-bg);
}

.error-details summary {
  cursor: pointer;
  font-weight: 500;
  margin-bottom: 12px;
}

.error-stack {
  font-family: 'Monaco', 'Consolas', 'Courier New', monospace;
  font-size: 12px;
  white-space: pre-wrap;
  overflow-x: auto;
  color: var(--text-secondary);
}

.command-history-error {
  text-align: center;
  padding: 2rem;
  background: white;
  border-radius: 8px;
  box-shadow: 0 2px 12px rgba(0, 0, 0, 0.08);
  border: 1px solid #e9ecef;
}

.command-history-error h3 {
  color: #e74c3c;
  margin-bottom: 1rem;
  font-weight: 600;
}

.retry-button {
  padding: 0.5rem 1rem;
  background: #3498db;
  color: white;
  border: none;
  border-radius: 6px;
  cursor: pointer;
  font-weight: 500;
  transition: all 0.2s ease;
}

.retry-button:hover {
  background: #2980b9;
  transform: translateY(-1px);
}
`;
