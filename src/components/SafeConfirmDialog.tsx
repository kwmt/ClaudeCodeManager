/**
 * Safe confirmation dialog component to replace window.confirm()
 *
 * SECURITY: This component replaces unsafe window.confirm() usage
 * and provides better UX with proper accessibility support
 */

import React, { useEffect, useRef } from "react";

interface SafeConfirmDialogProps {
  isOpen: boolean;
  title: string;
  message: string;
  confirmText?: string;
  cancelText?: string;
  variant?: "danger" | "warning" | "info";
  onConfirm: () => void;
  onCancel: () => void;
}

export const SafeConfirmDialog: React.FC<SafeConfirmDialogProps> = ({
  isOpen,
  title,
  message,
  confirmText = "確認",
  cancelText = "キャンセル",
  variant = "info",
  onConfirm,
  onCancel,
}) => {
  const dialogRef = useRef<HTMLDivElement>(null);
  const confirmButtonRef = useRef<HTMLButtonElement>(null);

  // フォーカス管理
  useEffect(() => {
    if (isOpen) {
      // ダイアログが開いたら確認ボタンにフォーカス
      confirmButtonRef.current?.focus();

      // Escapeキーでキャンセル
      const handleEscape = (e: KeyboardEvent) => {
        if (e.key === "Escape") {
          onCancel();
        }
      };

      document.addEventListener("keydown", handleEscape);
      return () => document.removeEventListener("keydown", handleEscape);
    }
  }, [isOpen, onCancel]);

  if (!isOpen) return null;

  const handleOverlayClick = (e: React.MouseEvent) => {
    if (e.target === e.currentTarget) {
      onCancel();
    }
  };

  const getButtonClass = () => {
    switch (variant) {
      case "danger":
        return "btn-danger";
      case "warning":
        return "btn-warning";
      default:
        return "btn-primary";
    }
  };

  return (
    <div
      className="dialog-overlay"
      onClick={handleOverlayClick}
      role="dialog"
      aria-modal="true"
      aria-labelledby="dialog-title"
      aria-describedby="dialog-message"
    >
      <div className="dialog-content" ref={dialogRef}>
        <div className="dialog-header">
          <h3 id="dialog-title">{title}</h3>
        </div>

        <div className="dialog-body">
          <p id="dialog-message">{message}</p>
        </div>

        <div className="dialog-actions">
          <button onClick={onCancel} className="btn-secondary" type="button">
            {cancelText}
          </button>
          <button
            ref={confirmButtonRef}
            onClick={onConfirm}
            className={getButtonClass()}
            type="button"
          >
            {confirmText}
          </button>
        </div>
      </div>
    </div>
  );
};

// ダイアログのスタイル（editors.cssに追加する必要があります）
export const DialogStyles = `
.dialog-overlay {
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
}

.dialog-content {
  background: var(--primary-bg);
  border-radius: 8px;
  box-shadow: 0 4px 12px rgba(0, 0, 0, 0.3);
  max-width: 500px;
  width: 90%;
  max-height: 80vh;
  overflow: auto;
}

.dialog-header {
  padding: 20px 24px 16px;
  border-bottom: 1px solid var(--border-color);
}

.dialog-header h3 {
  margin: 0;
  font-size: 18px;
  font-weight: 600;
}

.dialog-body {
  padding: 16px 24px;
}

.dialog-body p {
  margin: 0;
  line-height: 1.5;
}

.dialog-actions {
  padding: 16px 24px 20px;
  display: flex;
  gap: 12px;
  justify-content: flex-end;
}

.btn-warning {
  background: var(--warning-color);
  color: white;
}

.btn-warning:hover:not(:disabled) {
  background: #d69e2e;
}
`;
