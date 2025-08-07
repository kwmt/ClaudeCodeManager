import { useState, useEffect, useCallback, useMemo } from "react";
import { safeJSONParse, validateJSONContent } from "../utils/security";

interface JSONEditorProps {
  value: string;
  onChange: (value: string) => void;
  readOnly?: boolean;
  height?: string;
  onValidationChange?: (isValid: boolean, error?: string) => void;
}

// デバウンス関数
const debounce = <T extends (...args: any[]) => any>(
  func: T,
  wait: number,
): ((...args: Parameters<T>) => void) & { cancel: () => void } => {
  let timeoutId: ReturnType<typeof setTimeout>;
  const debounced = (...args: Parameters<T>) => {
    clearTimeout(timeoutId);
    timeoutId = setTimeout(() => func(...args), wait);
  };
  debounced.cancel = () => clearTimeout(timeoutId);
  return debounced;
};

export default function JSONEditor({
  value,
  onChange,
  readOnly = false,
  height = "400px",
  onValidationChange,
}: JSONEditorProps) {
  const [localValue, setLocalValue] = useState(value);
  const [error, setError] = useState<string | null>(null);
  const [isValidating, setIsValidating] = useState(false);

  // デバウンスされた検証関数
  const debouncedValidation = useMemo(
    () =>
      debounce((json: string) => {
        setIsValidating(true);
        const validation = validateJSONContent(json);

        if (validation.valid) {
          setError(null);
          onValidationChange?.(true);
        } else {
          setError(validation.error || "Invalid JSON");
          onValidationChange?.(false, validation.error);
        }
        setIsValidating(false);
      }, 300),
    [onValidationChange],
  );

  useEffect(() => {
    setLocalValue(value);
    if (value.trim()) {
      debouncedValidation(value);
    }

    // クリーンアップ関数でデバウンスをキャンセル
    return () => {
      if (typeof debouncedValidation.cancel === "function") {
        debouncedValidation.cancel();
      }
    };
  }, [value, debouncedValidation]);

  const handleChange = useCallback(
    (e: React.ChangeEvent<HTMLTextAreaElement>) => {
      const newValue = e.target.value;

      // 入力サイズ制限チェック
      if (newValue.length > 1024 * 1024) {
        // 1MB制限
        setError("ファイルサイズが大きすぎます（最大1MB）");
        return;
      }

      setLocalValue(newValue);
      onChange(newValue);

      if (newValue.trim()) {
        debouncedValidation(newValue);
      } else {
        setError(null);
        onValidationChange?.(true);
      }
    },
    [onChange, debouncedValidation, onValidationChange],
  );

  const formatJSON = useCallback(() => {
    try {
      const parsed = safeJSONParse(localValue); // 安全なパーサーを使用
      const formatted = JSON.stringify(parsed, null, 2);
      setLocalValue(formatted);
      onChange(formatted);
      setError(null);
      onValidationChange?.(true);
    } catch (e) {
      const errorMessage =
        e instanceof Error ? e.message : "Cannot format invalid JSON";
      setError(errorMessage);
      onValidationChange?.(false, errorMessage);
    }
  }, [localValue, onChange, onValidationChange]);

  return (
    <div className="json-editor">
      <div className="json-editor-toolbar">
        <button
          onClick={formatJSON}
          disabled={readOnly || !!error || isValidating}
          className="btn-secondary"
          aria-label="JSONを整形する"
        >
          Format JSON
        </button>
        {isValidating && (
          <span className="json-validating">🔄 Validating...</span>
        )}
        {error && (
          <span className="json-error" role="alert" aria-live="polite">
            ⚠️ {error}
          </span>
        )}
      </div>
      <textarea
        value={localValue}
        onChange={handleChange}
        readOnly={readOnly}
        className={`json-editor-textarea ${error ? "has-error" : ""}`}
        style={{ height }}
        spellCheck={false}
        aria-label="JSON content editor"
        aria-describedby={error ? "json-error" : undefined}
      />
    </div>
  );
}
