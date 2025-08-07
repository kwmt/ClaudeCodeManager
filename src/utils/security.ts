/**
 * Security utilities for Claude Code Manager
 *
 * CRITICAL: This file contains security functions to prevent XSS and prototype pollution attacks
 */

/**
 * Safely render text content without XSS risks
 */
export const sanitizeText = (text: string): string => {
  if (typeof text !== "string") {
    return "";
  }

  // HTML エスケープ処理
  return text
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&#x27;")
    .replace(/\//g, "&#x2F;");
};

/**
 * Safe JSON parser that prevents prototype pollution
 */
export const safeJSONParse = (text: string): unknown => {
  const reviver = (key: string, value: any) => {
    // プロトタイプ汚染を防ぐキーをブロック
    if (["__proto__", "constructor", "prototype"].includes(key)) {
      return undefined;
    }
    return value;
  };

  try {
    return JSON.parse(text, reviver);
  } catch (error) {
    throw new Error(
      `Invalid JSON format: ${error instanceof Error ? error.message : "Unknown error"}`,
    );
  }
};

/**
 * Validate and sanitize file names to prevent path traversal
 */
export const validateFileName = (
  filename: string,
): { valid: boolean; error?: string; sanitized?: string } => {
  if (!filename || typeof filename !== "string") {
    return { valid: false, error: "ファイル名は必須です" };
  }

  if (filename.length === 0 || filename.length > 100) {
    return { valid: false, error: "ファイル名は1-100文字で入力してください" };
  }

  // パストラバーサル攻撃を防ぐ
  if (
    filename.includes("..") ||
    filename.includes("/") ||
    filename.includes("\\")
  ) {
    return { valid: false, error: "不正なパス文字が含まれています" };
  }

  // NULLバイト攻撃を防ぐ
  if (filename.includes("\0")) {
    return { valid: false, error: "不正な文字が含まれています" };
  }

  // 安全な文字のみ許可
  const safePattern = /^[a-zA-Z0-9._-]+$/;
  if (!safePattern.test(filename)) {
    return {
      valid: false,
      error:
        "使用できない文字が含まれています（英数字、ピリオド、ハイフン、アンダースコアのみ可）",
    };
  }

  return { valid: true, sanitized: filename };
};

/**
 * Validate JSON content with size limits
 */
export const validateJSONContent = (
  content: string,
): { valid: boolean; error?: string; parsed?: unknown } => {
  if (!content || typeof content !== "string") {
    return { valid: false, error: "コンテンツは必須です" };
  }

  // サイズ制限（1MB）
  if (content.length > 1024 * 1024) {
    return { valid: false, error: "ファイルサイズが大きすぎます（最大1MB）" };
  }

  try {
    const parsed = safeJSONParse(content);
    return { valid: true, parsed };
  } catch (error) {
    return {
      valid: false,
      error: `JSONフォーマットが不正です: ${error instanceof Error ? error.message : "Unknown error"}`,
    };
  }
};

/**
 * Safe component for rendering potentially unsafe content
 */
import React from "react";

interface SafeTextProps {
  content: string;
  className?: string;
}

export const SafeText: React.FC<SafeTextProps> = ({ content, className }) => {
  const sanitized = sanitizeText(content);
  return React.createElement("span", { className }, sanitized);
};

interface SafeCodeProps {
  content: string;
  className?: string;
}

export const SafeCode: React.FC<SafeCodeProps> = ({ content, className }) => {
  const sanitized = sanitizeText(content);
  return React.createElement("code", { className }, sanitized);
};

interface SafeJSONProps {
  data: unknown;
  className?: string;
}

export const SafeJSON: React.FC<SafeJSONProps> = ({ data, className }) => {
  const jsonString = JSON.stringify(data, null, 2);
  const sanitized = sanitizeText(jsonString);
  return React.createElement("pre", { className }, sanitized);
};
