# CLAUDE.md

このファイルは、Claude Code (claude.ai/code) がこのリポジトリで作業する際のガイダンスを提供します。

## プロジェクト概要

Claude Code Managerは、Claude Code CLIセッションを管理するためのTauriベースのデスクトップGUIアプリケーションです。`~/.claude`ディレクトリに保存されたClaude Codeセッションデータを可視化・管理し、セッション閲覧、コマンド履歴、TODO管理、設定の構成機能を提供するデスクトップインターフェースです。

## 開発コマンド

### 基本開発
```bash
# 開発モード起動（RustとReactの両方でホットリロード）
npm run tauri:dev

# プロダクションアプリケーションビルド
npm run tauri:build

# フロントエンドのみの開発（TauriなしでUI作業時）
npm run dev
```

### テスト
```bash
# React/TypeScriptテスト実行
npm run test
npm run test:ui          # インタラクティブテストランナー
npm run test:coverage    # カバレッジレポート付き

# Rustテスト実行
npm run cargo:test       # 標準テスト実行
npm run cargo:test:fast  # キャッシュ最適化された高速テスト実行
```

### コード品質
```bash
# TypeScript型チェック
npm run check

# Rustリンティング（cargo clippy）
npm run lint
```

## アーキテクチャ

### 技術スタック
- **フロントエンド**: React 18 + TypeScript + Vite + Vitest
- **バックエンド**: Rust + Tauri v2 + Tokio + Serde + Chrono
- **データソース**: `~/.claude`ディレクトリ（Claude Codeセッションデータ）

### 主要ディレクトリ
- `src-tauri/src/`: データ処理とTauriコマンドを含むRustバックエンド
- `src/components/`: ReactUIコンポーネント（Dashboard、SessionBrowserなど）
- `src/api.ts`: Tauri APIラッパー関数
- `src/types.ts`: Rustモデルに対応するTypeScript型定義

### データフロー
1. ReactコンポーネントがAPIから`api.ts`の関数を呼び出し
2. `api.ts`が`src-tauri/src/commands.rs`で定義されたTauriコマンドを実行
3. コマンドが`ClaudeDataManager`を使用して`~/.claude`ディレクトリを読み込み・解析
4. データがSerdeでシリアライズされ、JSONでフロントエンドに返却

### 主要コンポーネント

#### Rustバックエンド（`src-tauri/src/`）
- `claude_data.rs`: `~/.claude`ディレクトリのキャッシュ機能付きメインデータマネージャー
- `commands.rs`: フロントエンドに公開されるTauriコマンド定義
- `models.rs`: Serdeシリアライゼーション付きデータ構造
- `lib.rs`: アプリ初期化とコマンドハンドラー登録

#### Reactフロントエンド（`src/`）
- `Dashboard.tsx`: セッション統計とプロジェクト概要
- `SessionBrowser.tsx`: Claude Codeセッションの閲覧と検索
- `CommandHistory.tsx`: コマンド実行履歴の表示
- `TodoManager.tsx`: プロジェクトのTODOアイテム管理
- `SettingsEditor.tsx`: Claude Codeの権限とフックの編集

## 新機能の追加

### 新しいTauriコマンドの場合
1. `models.rs`でデータ構造を定義
2. `claude_data.rs`でロジックを実装
3. `commands.rs`でコマンド関数を作成
4. `lib.rs`のinvoke_handlerにコマンドを登録
5. `api.ts`にフロントエンドラッパーを追加

### データソース
アプリは以下の`~/.claude`場所から読み取ります：
- セッション: `projects/{project}/{session_id}.jsonl`
- TODO: `todos/{project}.json`
- 設定: `settings.json`
- コマンド履歴: `command_history.log`

### エラーハンドリング
- Rust関数は`Result<T, String>`を返す
- フロントエンドは適切なエラー表示でtry-catchを使用
- `ClaudeDataManager`は繰り返しファイルシステム読み込みを避けるキャッシュを含む

## テスト戦略

### フロントエンドテスト
- コンポーネントテスト用のVitest + React Testing Library
- ブラウザ環境シミュレーション用のJSDOM
- `src/tests/`のテストファイル

### バックエンドテスト
- `#[cfg(test)]`による標準Rustテスト
- 非同期機能用のTokio-test
- `src-tauri/src/tests.rs`のテストファイル

## 設定

### 重要な設定ファイル
- `tauri.conf.json`: アプリ権限、ウィンドウ設定、ビルド設定
- `vite.config.ts`: 開発サーバー（ポート1420）とTauri統合
- `Cargo.toml`: Rust依存関係とTauri機能