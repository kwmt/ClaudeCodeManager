# Claude Code Manager

Claude Codeを管理するためのクロスプラットフォーム対応GUIツールです。

![Claude Code Manager Screenshot](./docs/screenshot.png)

## 🎯 概要

Claude Code Managerは、複数のターミナルやIDE環境でのClaude Codeセッションを統合管理するためのデスクトップアプリケーションです。Tauri + React + TypeScript + Rustで構築されており、macOS、Windows、Linuxで動作します。

## ✨ 主な機能

### 🎛️ ダッシュボード
- セッション統計とプロジェクト概要の表示
- アクティブプロジェクト数、総メッセージ数、保留中TODOの可視化
- プロジェクト別のアクティビティサマリー

### 🔍 セッションブラウザ
- プロジェクト横断での対話履歴の閲覧・検索
- セッションメッセージの詳細表示
- JSONエクスポート機能
- リアルタイム検索とフィルタリング

### 💻 コマンド履歴
- bashコマンドの検索可能なログ表示
- コマンドのコピー機能
- 実行コンテキスト情報
- タイムスタンプ付き履歴

### ✅ TODOマネージャ
- 全セッションのタスク統合表示
- ステータス別フィルタリング（Pending/InProgress/Completed）
- 優先度管理（High/Medium/Low）
- タスク統計の可視化

### ⚙️ 設定エディター
- 権限・フック・セキュリティポリシーの表示
- 設定ファイルのエクスポート
- JSON生データビューア
- 安全性確認機能

## 🛠️ 技術スタック

### Backend (Rust)
- **Tauri 2.0**: クロスプラットフォームアプリケーションフレームワーク
- **Tokio**: 非同期ランタイム
- **Serde**: JSON/JSONL シリアライゼーション
- **Notify**: ファイル監視
- **Chrono**: 日時処理

### Frontend (React + TypeScript)
- **React 18**: UIライブラリ
- **TypeScript**: 型安全なJavaScript
- **Vite**: 高速ビルドツール
- **CSS**: カスタムスタイリング

## 🚀 セットアップ

### 前提条件

以下がインストールされている必要があります:

- **Node.js** (v18以上)
- **Rust** (最新安定版)
- **npm** または **yarn**

### 1. リポジトリのクローン

```bash
git clone https://github.com/kwmt/ClaudeCodeManager.git
cd ClaudeCodeManager/claude-code-manager
```

### 2. 依存関係のインストール

```bash
# Node.js依存関係のインストール
npm install

# Rust依存関係は自動でインストールされます
```

### 3. 開発環境での実行

```bash
# 開発サーバーの起動
npm run tauri:dev
```

このコマンドで開発版のアプリケーションが起動し、コードの変更をリアルタイムで反映できます。

## 📋 利用可能なスクリプト

### 開発・ビルド
```bash
npm run dev              # Vite開発サーバー起動
npm run build            # プロダクションビルド
npm run tauri:dev        # Tauri開発環境起動
npm run tauri:build      # Tauriアプリケーションビルド
```

### テスト
```bash
npm run test             # フロントエンドテスト実行
npm run test:ui          # テストUIで実行
npm run test:coverage    # カバレッジ付きテスト実行
npm run cargo:test       # Rustテスト実行
```

### 品質チェック
```bash
npm run lint             # Rust linting (clippy)
npm run check            # 型チェック + Cargoチェック
npm run cargo:clippy     # Rust linting
npm run cargo:check      # Rust構文チェック
```

## 🏗️ プロダクションビルド

### デスクトップアプリケーションのビルド

```bash
npm run tauri:build
```

ビルド成果物は以下の場所に生成されます:
- **macOS**: `src-tauri/target/release/bundle/macos/`
- **Windows**: `src-tauri/target/release/bundle/msi/`
- **Linux**: `src-tauri/target/release/bundle/deb/` または `src-tauri/target/release/bundle/appimage/`

### システム別の追加要件

#### Ubuntu/Debian
```bash
sudo apt-get update
sudo apt-get install -y libgtk-3-dev libwebkit2gtk-4.0-dev libappindicator3-dev librsvg2-dev patchelf
```

#### Fedora/RHEL
```bash
sudo dnf install gtk3-devel webkit2gtk3-devel libappindicator-gtk3-devel librsvg2-devel
```

## 🧪 テスト実行

### フロントエンドテスト
```bash
# 全テスト実行
npm run test

# ウォッチモードでテスト実行
npm run test -- --watch

# カバレッジ付きテスト
npm run test:coverage

# UIでテスト実行
npm run test:ui
```

### バックエンドテスト
```bash
# Rustテスト実行
npm run cargo:test

# 詳細出力付きテスト
cd src-tauri && cargo test -- --nocapture
```

## 📁 プロジェクト構造

```
claude-code-manager/
├── src/                          # React フロントエンド
│   ├── components/              # Reactコンポーネント
│   │   ├── Dashboard.tsx
│   │   ├── SessionBrowser.tsx
│   │   ├── CommandHistory.tsx
│   │   ├── TodoManager.tsx
│   │   └── SettingsEditor.tsx
│   ├── tests/                   # フロントエンドテスト
│   ├── types.ts                 # TypeScript型定義
│   ├── api.ts                   # API層
│   └── App.tsx                  # メインアプリ
├── src-tauri/                   # Rust バックエンド
│   ├── src/
│   │   ├── models.rs           # データモデル
│   │   ├── claude_data.rs      # データ管理層
│   │   ├── commands.rs         # Tauriコマンド
│   │   ├── tests.rs            # Rustテスト
│   │   └── lib.rs              # メインライブラリ
│   └── Cargo.toml              # Rust依存関係
├── .github/workflows/          # CI/CD設定
├── package.json                # Node.js設定
└── README.md                   # このファイル
```

## 🔧 設定

### Claude Codeディレクトリ

アプリケーションは `~/.claude` ディレクトリから以下のデータを読み取ります:

- **sessions**: `projects/*/[session-id].jsonl`
- **todos**: `todos/[session-id].json`
- **commands**: `command_history.log`
- **settings**: `settings.json`

### 対応データ形式

- **会話セッション**: JSONL形式の対話ログ
- **TODOリスト**: JSON形式のタスクデータ
- **コマンドログ**: タイムスタンプ付きテキスト
- **設定ファイル**: JSON形式の設定データ

## 🤝 コントリビューション

1. フォークしてください
2. フィーチャーブランチを作成してください (`git checkout -b feature/amazing-feature`)
3. 変更をコミットしてください (`git commit -m 'Add some amazing feature'`)
4. ブランチをプッシュしてください (`git push origin feature/amazing-feature`)
5. プルリクエストを作成してください

### 開発ガイドライン

- TypeScriptの型安全性を保つ
- Rustのクリッピー警告を解決する
- テストカバレッジを維持する
- コミットメッセージは分かりやすく書く

## 📄 ライセンス

このプロジェクトはMITライセンスの下で公開されています。詳細は [LICENSE](LICENSE) ファイルを参照してください。

## 🐛 バグ報告・機能要望

[GitHub Issues](https://github.com/kwmt/ClaudeCodeManager/issues) でバグ報告や機能要望をお受けしています。

## 📞 サポート

- **Issues**: [GitHub Issues](https://github.com/kwmt/ClaudeCodeManager/issues)
- **Wiki**: [GitHub Wiki](https://github.com/kwmt/ClaudeCodeManager/wiki)

---

**🤖 Generated with [Claude Code](https://claude.ai/code)**
