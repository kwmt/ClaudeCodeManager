import React, { useMemo } from "react";

// TypeScript型定義
interface TextHighlightProps {
  /** ハイライト対象のテキスト */
  text: string;
  /** 検索クエリ（空文字列の場合はハイライトなし） */
  searchQuery: string;
  /** 追加のCSSクラス名 */
  className?: string;
  /** ハイライト用のCSSクラス名（デフォルト: undefined） */
  highlightClassName?: string;
}

// 正規表現の特殊文字をエスケープする関数
const escapeRegExp = (string: string): string => {
  return string.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
};

// 入力値を検証・サニタイズする関数
const sanitizeInput = (input: string): string => {
  if (typeof input !== "string") {
    return "";
  }
  // 基本的な文字列サニタイゼーション
  return input.trim();
};

/**
 * セキュアなテキストハイライトコンポーネント
 *
 * セキュリティ特徴:
 * - dangerouslySetInnerHTMLを使わない安全な実装
 * - 正規表現特殊文字の適切なエスケープ
 * - XSS攻撃を防ぐためのReactの組み込みエスケープを活用
 * - 入力値の検証とサニタイゼーション
 *
 * パフォーマンス特徴:
 * - React.memoによる不要な再レンダリング防止
 * - useMemoによる重い処理のメモ化
 * - 効率的なキー生成でReactの差分アルゴリズム最適化
 *
 * アクセシビリティ特徴:
 * - セマンティックなmark要素の使用
 * - ARIA属性による検索結果の明示
 * - スクリーンリーダー対応
 */
const TextHighlight: React.FC<TextHighlightProps> = React.memo(
  ({ text, searchQuery, className, highlightClassName }) => {
    // 入力値のサニタイゼーション
    const sanitizedText = useMemo(() => sanitizeInput(text), [text]);
    const sanitizedQuery = useMemo(
      () => sanitizeInput(searchQuery),
      [searchQuery],
    );

    // テキスト分割とハイライト処理のメモ化
    const highlightedElements = useMemo(() => {
      // 空のテキストまたは検索クエリの場合は元のテキストをそのまま返す
      if (!sanitizedText || !sanitizedQuery) {
        return [sanitizedText];
      }

      try {
        // 検索クエリの正規表現特殊文字をエスケープ
        const escapedQuery = escapeRegExp(sanitizedQuery);

        // 大文字小文字を区別しない正規表現を作成
        const regex = new RegExp(`(${escapedQuery})`, "gi");

        // テキストを検索クエリで分割
        const parts = sanitizedText.split(regex);

        // 分割された各部分をReact要素に変換
        return parts
          .map((part, index) => {
            // 空文字列の場合はスキップ
            if (!part) {
              return null;
            }

            // 検索クエリと一致する部分をハイライト
            const isMatch = regex.test(part);
            // 正規表現の状態をリセット（global flagの影響を避けるため）
            regex.lastIndex = 0;

            if (isMatch) {
              return (
                <mark
                  key={`highlight-${index}`}
                  className={highlightClassName}
                  // アクセシビリティ: スクリーンリーダーに検索結果であることを伝える
                  role="mark"
                  aria-label={`検索結果: ${part}`}
                >
                  {part}
                </mark>
              );
            }

            return <span key={`text-${index}`}>{part}</span>;
          })
          .filter(Boolean); // null要素を除去
      } catch (error) {
        // 正規表現エラーが発生した場合は元のテキストを返す
        console.warn(
          "TextHighlight: 正規表現の処理中にエラーが発生しました:",
          error,
        );
        return [sanitizedText];
      }
    }, [sanitizedText, sanitizedQuery, highlightClassName]);

    // メインの描画部分
    return (
      <span
        className={className}
        // アクセシビリティ: 検索結果があることを示す
        aria-label={
          sanitizedQuery
            ? `テキスト内の "${sanitizedQuery}" の検索結果`
            : undefined
        }
      >
        {highlightedElements}
      </span>
    );
  },
);

// デバッグ用の表示名を設定
TextHighlight.displayName = "TextHighlight";

export default TextHighlight;

// 使用例とタイプエクスポート
export type { TextHighlightProps };

/*
使用例:

import TextHighlight from './components/ui/TextHighlight';

// 基本的な使用方法
<TextHighlight 
  text="Hello, this is a sample text for highlighting"
  searchQuery="sample"
/>

// CSSクラスを指定した使用方法
<TextHighlight 
  text="Hello, this is a sample text for highlighting"
  searchQuery="sample"
  className="my-text"
  highlightClassName="custom-highlight"
/>

// 空の検索クエリ（ハイライトなし）
<TextHighlight 
  text="Hello, this is a sample text"
  searchQuery=""
/>

CSS例:
.custom-highlight {
  background-color: yellow;
  color: black;
  font-weight: bold;
  padding: 0 2px;
  border-radius: 2px;
}
*/
