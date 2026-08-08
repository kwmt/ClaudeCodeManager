//! Claude Code CLI をヘッドレスモード（`-p --output-format stream-json`）で起動し、
//! 標準出力の stream-json を Tauri イベントとしてフロントエンドへ中継するモジュール。
//!
//! 設計上のポイント:
//! - GUI アプリは Finder から起動されると PATH が最小限になるため、CLI の場所を多段で解決する
//! - プロンプトは argv ではなく stdin へ渡す（クォート事故・引数インジェクション回避）
//! - CLI へ渡す `--resume` / `--model` の値は厳格にバリデーションする
//! - 停止時はプロセスグループごとシグナルを送り、子孫プロセスを残さない

use std::collections::HashMap;
use std::path::{Path, PathBuf};
use std::process::Stdio;
use std::sync::atomic::{AtomicBool, Ordering};
use std::sync::{Arc, Mutex, MutexGuard, OnceLock};
use std::time::Duration;

use tauri::{AppHandle, Emitter};
use tokio::io::{AsyncBufReadExt, AsyncWriteExt, BufReader};
use tokio::process::{ChildStderr, ChildStdin, ChildStdout, Command};
use uuid::Uuid;

use crate::models::{ClaudeCliStatus, PermissionMode, PromptRunEvent, PromptRunEventKind};

/// フロントエンドが購読する Tauri イベント名（API 契約で固定）。
pub const PROMPT_RUN_EVENT: &str = "prompt-run-event";

/// `--resume` に渡すセッション ID の最大長。
const MAX_SESSION_ID_LEN: usize = 64;
/// `--model` に渡すモデル名の最大長。
const MAX_MODEL_LEN: usize = 64;
/// ログインシェルや `claude --version` など補助プロセスのタイムアウト。
const HELPER_PROCESS_TIMEOUT: Duration = Duration::from_secs(5);
/// SIGTERM 後に終了を待つポーリング間隔。
const STOP_POLL_INTERVAL: Duration = Duration::from_millis(100);
/// SIGKILL へ切り替えるまでのポーリング回数（100ms × 20 = 2 秒）。
const STOP_POLL_ATTEMPTS: u32 = 20;

// ---------------------------------------------------------------------------
// CLI バイナリ解決
// ---------------------------------------------------------------------------

/// `claude` バイナリの絶対パスを解決する。
///
/// 解決順:
/// 1. 環境変数 `CLAUDE_CLI_PATH`（明示指定を最優先）
/// 2. ログインシェル経由の `command -v claude`（unix のみ）
/// 3. 既知のインストール先候補
/// 4. 現在のプロセスの `PATH`
///
/// 内部でファイル存在確認と補助プロセス起動を行うためブロッキングする。
/// 非同期コンテキストからは [`resolve_cli_environment`] 経由で呼ぶこと。
pub fn resolve_claude_binary() -> Result<PathBuf, String> {
    // 解決にはログインシェルの起動が伴い数百 ms かかることがある。
    // プロンプト送信のたびに払うコストではないため、成功結果だけキャッシュする
    // （失敗をキャッシュすると、CLI を後から入れたときに再起動が必須になる）。
    static CACHED_BINARY: OnceLock<PathBuf> = OnceLock::new();
    if let Some(cached) = CACHED_BINARY.get() {
        if cached.is_file() {
            return Ok(cached.clone());
        }
    }

    let resolved = resolve_claude_binary_uncached()?;
    let _ = CACHED_BINARY.set(resolved.clone());
    Ok(resolved)
}

/// キャッシュを介さずに `claude` バイナリを探索する。
fn resolve_claude_binary_uncached() -> Result<PathBuf, String> {
    if let Some(path) = binary_from_env_var() {
        return Ok(path);
    }

    #[cfg(unix)]
    if let Some(path) = binary_from_login_shell() {
        return Ok(path);
    }

    if let Some(path) = known_install_candidates().into_iter().find(|p| p.is_file()) {
        return Ok(path);
    }

    if let Some(path) = binary_from_path_env() {
        return Ok(path);
    }

    Err(concat!(
        "Claude Code CLI (`claude`) が見つかりませんでした。",
        "インストール済みか確認するか、環境変数 CLAUDE_CLI_PATH に ",
        "`claude` の絶対パスを設定してからアプリを再起動してください。"
    )
    .to_string())
}

/// 環境変数 `CLAUDE_CLI_PATH` で明示指定されたパスを取得する。
fn binary_from_env_var() -> Option<PathBuf> {
    let raw = std::env::var_os("CLAUDE_CLI_PATH")?;
    let path = PathBuf::from(raw);
    path.is_file().then_some(path)
}

/// 既知のインストール先候補（存在チェックは呼び出し側）。
fn known_install_candidates() -> Vec<PathBuf> {
    let mut candidates = Vec::with_capacity(5);

    if let Some(home) = dirs::home_dir() {
        candidates.push(home.join(".local").join("bin").join("claude"));
        candidates.push(home.join(".claude").join("local").join("claude"));
    }
    candidates.push(PathBuf::from("/opt/homebrew/bin/claude"));
    candidates.push(PathBuf::from("/usr/local/bin/claude"));
    candidates.push(PathBuf::from("/usr/bin/claude"));

    candidates
}

/// 現在のプロセスの `PATH` を走査して `claude` を探す。
fn binary_from_path_env() -> Option<PathBuf> {
    // Windows では拡張子付きの実体を優先して探す。
    let file_names: &[&str] = if cfg!(windows) {
        &["claude.cmd", "claude.exe", "claude"]
    } else {
        &["claude"]
    };

    let path_var = std::env::var_os("PATH")?;
    std::env::split_paths(&path_var).find_map(|dir| {
        file_names
            .iter()
            .map(|name| dir.join(name))
            .find(|candidate| candidate.is_file())
    })
}

/// ログインシェル経由で `claude` の場所を解決する。
#[cfg(unix)]
fn binary_from_login_shell() -> Option<PathBuf> {
    let stdout = run_login_shell("command -v claude")?;
    let first_line = stdout.lines().next()?.trim();
    if first_line.is_empty() {
        return None;
    }

    let path = PathBuf::from(first_line);
    path.is_file().then_some(path)
}

/// ログインシェルの `PATH`（プロセス内キャッシュ）。
///
/// `claude` は node を必要とするため、子プロセスにはログインシェル相当の
/// `PATH` を渡す。取得できない場合は `None`（現在の `PATH` をそのまま使う）。
pub fn login_shell_path() -> Option<String> {
    static LOGIN_SHELL_PATH: OnceLock<Option<String>> = OnceLock::new();
    LOGIN_SHELL_PATH
        .get_or_init(detect_login_shell_path)
        .clone()
}

#[cfg(unix)]
fn detect_login_shell_path() -> Option<String> {
    let stdout = run_login_shell("echo $PATH")?;
    let path = stdout.lines().next()?.trim().to_string();
    (!path.is_empty()).then_some(path)
}

#[cfg(not(unix))]
fn detect_login_shell_path() -> Option<String> {
    None
}

/// `$SHELL -lc <script>` を実行し、標準出力を返す。
///
/// ログインシェルの初期化スクリプトが固まるケースに備えてタイムアウトを設け、
/// 超過したら子プロセスを kill して `None` を返す（アプリを巻き込まない）。
#[cfg(unix)]
fn run_login_shell(script: &str) -> Option<String> {
    let shell = std::env::var("SHELL").ok().filter(|s| !s.is_empty())?;

    let mut child = std::process::Command::new(shell)
        .arg("-lc")
        .arg(script)
        .stdin(Stdio::null())
        .stdout(Stdio::piped())
        .stderr(Stdio::null())
        .spawn()
        .ok()?;

    let deadline = std::time::Instant::now() + HELPER_PROCESS_TIMEOUT;
    loop {
        match child.try_wait() {
            Ok(Some(_)) => break,
            Ok(None) if std::time::Instant::now() < deadline => {
                std::thread::sleep(Duration::from_millis(25));
            }
            // タイムアウト、または待機自体の失敗
            _ => {
                let _ = child.kill();
                let _ = child.wait();
                return None;
            }
        }
    }

    let output = child.wait_with_output().ok()?;
    output
        .status
        .success()
        .then(|| String::from_utf8_lossy(&output.stdout).into_owned())
}

/// ブロッキング処理（バイナリ探索とログインシェル起動）をまとめて実行する。
///
/// 非同期コマンドからは `tokio::task::spawn_blocking` 経由で呼び出す。
fn resolve_cli_environment() -> Result<(PathBuf, Option<String>), String> {
    let binary = resolve_claude_binary()?;
    Ok((binary, login_shell_path()))
}

/// `spawn_blocking` で CLI 環境を解決する非同期ラッパー。
async fn resolve_cli_environment_async() -> Result<(PathBuf, Option<String>), String> {
    tokio::task::spawn_blocking(resolve_cli_environment)
        .await
        .map_err(|e| format!("CLI パスの解決に失敗しました: {e}"))?
}

// ---------------------------------------------------------------------------
// CLI 引数の組み立て
// ---------------------------------------------------------------------------

/// `claude` に渡す引数列を組み立てる（副作用のない純粋関数）。
///
/// `resume_session_id` / `model` は引数インジェクションを防ぐため、
/// 長さ・文字種・先頭ハイフンを検証する。
pub fn build_claude_args(
    permission_mode: PermissionMode,
    resume_session_id: Option<&str>,
    model: Option<&str>,
) -> Result<Vec<String>, String> {
    let mut args = vec![
        "-p".to_string(),
        "--output-format".to_string(),
        "stream-json".to_string(),
        "--verbose".to_string(),
        "--permission-mode".to_string(),
        permission_mode.as_cli_arg().to_string(),
    ];

    if let Some(session_id) = resume_session_id {
        validate_cli_value(
            session_id,
            MAX_SESSION_ID_LEN,
            is_session_id_char,
            "セッション ID",
        )?;
        args.push("--resume".to_string());
        args.push(session_id.to_string());
    }

    if let Some(model) = model {
        validate_cli_value(model, MAX_MODEL_LEN, is_model_char, "モデル名")?;
        args.push("--model".to_string());
        args.push(model.to_string());
    }

    Ok(args)
}

/// CLI に渡す値の安全性を検証する。
fn validate_cli_value(
    value: &str,
    max_len: usize,
    is_allowed_char: fn(char) -> bool,
    label: &str,
) -> Result<(), String> {
    if value.is_empty() {
        return Err(format!("{label}が空です。"));
    }
    if value.len() > max_len {
        return Err(format!("{label}が長すぎます（最大 {max_len} 文字）。"));
    }
    // 先頭がハイフンだと別のオプションとして解釈されうるため拒否する。
    if value.starts_with('-') {
        return Err(format!("{label}をハイフンで始めることはできません。"));
    }
    if !value.chars().all(is_allowed_char) {
        return Err(format!("{label}に使用できない文字が含まれています。"));
    }
    Ok(())
}

/// セッション ID に許可する文字（`[A-Za-z0-9_-]`）。
fn is_session_id_char(c: char) -> bool {
    c.is_ascii_alphanumeric() || matches!(c, '_' | '-')
}

/// モデル名に許可する文字（`[A-Za-z0-9._-]`）。
fn is_model_char(c: char) -> bool {
    c.is_ascii_alphanumeric() || matches!(c, '.' | '_' | '-')
}

// ---------------------------------------------------------------------------
// CLI の状態取得
// ---------------------------------------------------------------------------

/// `claude` CLI の利用可否を調べる。解決に失敗しても `Err` にはせず、
/// UI が警告バナーを出せるよう `available: false` を返す。
pub async fn claude_cli_status() -> ClaudeCliStatus {
    match resolve_cli_environment_async().await {
        Ok((binary, path_env)) => {
            let version = claude_version(&binary, path_env.as_deref()).await;
            ClaudeCliStatus {
                available: true,
                path: Some(binary.to_string_lossy().into_owned()),
                version,
                error: None,
            }
        }
        Err(error) => ClaudeCliStatus {
            available: false,
            path: None,
            version: None,
            error: Some(error),
        },
    }
}

/// `claude --version` の出力（トリム済み）を取得する。失敗時は `None`。
async fn claude_version(binary: &Path, path_env: Option<&str>) -> Option<String> {
    let mut command = Command::new(binary);
    command
        .arg("--version")
        .stdin(Stdio::null())
        .stdout(Stdio::piped())
        .stderr(Stdio::null())
        .kill_on_drop(true);
    if let Some(path) = path_env {
        command.env("PATH", path);
    }

    let output = tokio::time::timeout(HELPER_PROCESS_TIMEOUT, command.output())
        .await
        .ok()?
        .ok()?;
    if !output.status.success() {
        return None;
    }

    let version = String::from_utf8_lossy(&output.stdout).trim().to_string();
    (!version.is_empty()).then_some(version)
}

// ---------------------------------------------------------------------------
// 実行管理
// ---------------------------------------------------------------------------

/// 1 回の実行に対する制御情報。
struct RunControl {
    /// 子プロセスの PID（unix ではプロセスグループ ID も兼ねる）。
    pid: Option<u32>,
    /// ユーザーによる停止要求フラグ。
    cancelled: Arc<AtomicBool>,
}

/// `start_prompt_run` の入力値。
pub struct StartPromptRunRequest {
    pub project_path: String,
    pub prompt: String,
    pub permission_mode: PermissionMode,
    pub resume_session_id: Option<String>,
    pub model: Option<String>,
}

/// 実行中の `claude` プロセスを run_id で管理する。
#[derive(Default)]
pub struct PromptRunner {
    runs: Mutex<HashMap<String, RunControl>>,
}

impl PromptRunner {
    pub fn new() -> Self {
        Self::default()
    }

    /// `runs` のロックを取得する。ロック汚染時もデータ自体は健全なため復帰する。
    ///
    /// 注意: 返した guard を `.await` をまたいで保持しないこと。
    fn runs(&self) -> MutexGuard<'_, HashMap<String, RunControl>> {
        self.runs
            .lock()
            .unwrap_or_else(|poisoned| poisoned.into_inner())
    }

    fn is_running(&self, run_id: &str) -> bool {
        self.runs().contains_key(run_id)
    }

    /// `claude` を起動し、run_id を返す。
    ///
    /// 起動に失敗した場合は `Err` を返し、イベントは一切流さない（契約 §3）。
    pub async fn start(
        self: &Arc<Self>,
        app: AppHandle,
        request: StartPromptRunRequest,
    ) -> Result<String, String> {
        let prompt = request.prompt.trim().to_string();
        if prompt.is_empty() {
            return Err("プロンプトが空です。".to_string());
        }

        let working_dir = PathBuf::from(&request.project_path);
        if !working_dir.is_dir() {
            return Err(format!(
                "プロジェクトディレクトリが見つかりません: {}",
                request.project_path
            ));
        }

        let args = build_claude_args(
            request.permission_mode,
            request.resume_session_id.as_deref(),
            request.model.as_deref(),
        )?;

        let (binary, path_env) = resolve_cli_environment_async().await?;

        let mut command = Command::new(&binary);
        command
            .args(&args)
            .current_dir(&working_dir)
            .stdin(Stdio::piped())
            .stdout(Stdio::piped())
            .stderr(Stdio::piped())
            .kill_on_drop(true);
        if let Some(path) = path_env {
            command.env("PATH", path);
        }
        // 停止時にプロセスグループごと終了させるため、リーダーにしておく。
        #[cfg(unix)]
        command.process_group(0);

        let mut child = command
            .spawn()
            .map_err(|e| format!("Claude Code CLI の起動に失敗しました: {e}"))?;

        let (Some(stdin), Some(stdout), Some(stderr)) =
            (child.stdin.take(), child.stdout.take(), child.stderr.take())
        else {
            let _ = child.kill().await;
            return Err("子プロセスの入出力ストリームを取得できませんでした。".to_string());
        };

        let run_id = Uuid::new_v4().to_string();
        let cancelled = Arc::new(AtomicBool::new(false));
        self.runs().insert(
            run_id.clone(),
            RunControl {
                pid: child.id(),
                cancelled: Arc::clone(&cancelled),
            },
        );

        let runner = Arc::clone(self);
        let supervised_run_id = run_id.clone();
        tokio::spawn(async move {
            // プロンプトの書き込みは出力の読み取りと並行させる。
            // 逐次実行にすると、パイプバッファを超える長いプロンプトで
            // 「CLI は stdout の掃け待ち / こちらは stdin の書き込み待ち」の
            // デッドロックに陥る。
            let stdin_task = tokio::spawn(write_prompt_to_stdin(
                app.clone(),
                supervised_run_id.clone(),
                stdin,
                prompt,
            ));
            let stdout_task = tokio::spawn(forward_stdout(
                app.clone(),
                supervised_run_id.clone(),
                stdout,
            ));
            let stderr_task = tokio::spawn(forward_stderr(
                app.clone(),
                supervised_run_id.clone(),
                stderr,
            ));

            let wait_result = child.wait().await;

            // PID 再利用による誤 kill を避けるため、プロセスを回収した直後に登録を解除する。
            // （登録が残っている間 = 子プロセスが未回収、が保証される）
            runner.runs().remove(&supervised_run_id);

            // 取りこぼしを防ぐため、両ストリームを読み切ってから exit を流す。
            let _ = stdin_task.await;
            let _ = stdout_task.await;
            let _ = stderr_task.await;

            let (exit_code, exited_successfully) = match wait_result {
                Ok(status) => (status.code(), status.success()),
                Err(e) => {
                    emit_event(
                        &app,
                        PromptRunEvent {
                            run_id: supervised_run_id.clone(),
                            kind: PromptRunEventKind::Error,
                            payload: None,
                            text: Some(format!("プロセスの終了待機に失敗しました: {e}")),
                            exit_code: None,
                            success: None,
                        },
                    );
                    (None, false)
                }
            };

            let success = exited_successfully && !cancelled.load(Ordering::SeqCst);
            emit_event(
                &app,
                PromptRunEvent {
                    run_id: supervised_run_id,
                    kind: PromptRunEventKind::Exit,
                    payload: None,
                    text: None,
                    exit_code,
                    success: Some(success),
                },
            );
        });

        Ok(run_id)
    }

    /// 実行中のプロンプトを停止する。
    ///
    /// unix ではプロセスグループ全体に SIGTERM を送り、2 秒待っても終了しなければ
    /// SIGKILL に切り替える。
    pub async fn stop(self: &Arc<Self>, run_id: &str) -> Result<(), String> {
        let pid = {
            let runs = self.runs();
            let control = runs
                .get(run_id)
                .ok_or_else(|| format!("実行中のプロンプトが見つかりません: {run_id}"))?;
            control.cancelled.store(true, Ordering::SeqCst);
            control.pid
        };

        let Some(pid) = pid else {
            return Err("プロセス ID を取得できないため停止できません。".to_string());
        };

        #[cfg(unix)]
        {
            signal_process_group(pid, libc::SIGTERM)?;

            for _ in 0..STOP_POLL_ATTEMPTS {
                tokio::time::sleep(STOP_POLL_INTERVAL).await;
                if !self.is_running(run_id) {
                    return Ok(());
                }
            }

            signal_process_group(pid, libc::SIGKILL)?;
        }

        #[cfg(windows)]
        {
            terminate_process_tree(pid)?;
        }

        Ok(())
    }
}

/// プロンプトを子プロセスの stdin に書き込み、EOF を伝えるため閉じる。
///
/// 出力の読み取りと並行して動かすため独立したタスクとして spawn される。
/// 子プロセスが先に終了していると EPIPE になるが、その場合は exit イベントで
/// 状況が伝わるため、エラーイベントは流さず黙って終える。
async fn write_prompt_to_stdin(
    app: AppHandle,
    run_id: String,
    mut stdin: ChildStdin,
    prompt: String,
) {
    if let Err(e) = stdin.write_all(prompt.as_bytes()).await {
        if e.kind() != std::io::ErrorKind::BrokenPipe {
            emit_event(
                &app,
                text_event(
                    &run_id,
                    PromptRunEventKind::Error,
                    format!("プロンプトの書き込みに失敗しました: {e}"),
                ),
            );
        }
        return;
    }

    // EOF を伝えないと CLI が入力待ちのまま止まるため、必ず閉じる。
    let _ = stdin.shutdown().await;
}

/// プロセスグループ全体にシグナルを送る。
#[cfg(unix)]
fn signal_process_group(pid: u32, signal: i32) -> Result<(), String> {
    let pgid = i32::try_from(pid).map_err(|_| "プロセス ID が想定外の値です。".to_string())?;

    // SAFETY: `kill(2)` の FFI 呼び出し。引数はスカラー値のみでポインタを渡さないため、
    // Rust 側のメモリ安全性に影響しない。第 1 引数を負値にすることでプロセスグループ
    // (spawn 時に `process_group(0)` で子をリーダーにしたグループ) 全体へ送る。
    if unsafe { libc::kill(-pgid, signal) } == 0 {
        return Ok(());
    }

    let error = std::io::Error::last_os_error();
    // 既に終了しているだけなら成功扱いにする。
    if error.raw_os_error() == Some(libc::ESRCH) {
        Ok(())
    } else {
        Err(format!("プロセスの停止に失敗しました: {error}"))
    }
}

/// 子プロセスとその子孫を強制終了する（Windows 用）。
#[cfg(windows)]
fn terminate_process_tree(pid: u32) -> Result<(), String> {
    std::process::Command::new("taskkill")
        .args(["/PID", &pid.to_string(), "/T", "/F"])
        .stdin(Stdio::null())
        .stdout(Stdio::null())
        .stderr(Stdio::null())
        .status()
        .map_err(|e| format!("プロセスの停止に失敗しました: {e}"))?;
    Ok(())
}

// ---------------------------------------------------------------------------
// 出力の中継
// ---------------------------------------------------------------------------

/// 標準出力を 1 行ずつ読み、stream-json ならそのまま、
/// パースできなければ stderr 扱いで中継する（出力を捨てない）。
async fn forward_stdout(app: AppHandle, run_id: String, stdout: ChildStdout) {
    let mut lines = BufReader::new(stdout).lines();

    loop {
        match lines.next_line().await {
            Ok(Some(line)) => {
                let trimmed = line.trim();
                if trimmed.is_empty() {
                    continue;
                }
                let event = match serde_json::from_str::<serde_json::Value>(trimmed) {
                    Ok(payload) => PromptRunEvent {
                        run_id: run_id.clone(),
                        kind: PromptRunEventKind::Message,
                        payload: Some(payload),
                        text: None,
                        exit_code: None,
                        success: None,
                    },
                    Err(_) => text_event(&run_id, PromptRunEventKind::Stderr, line),
                };
                emit_event(&app, event);
            }
            Ok(None) => break,
            Err(e) => {
                emit_event(
                    &app,
                    text_event(
                        &run_id,
                        PromptRunEventKind::Stderr,
                        format!("標準出力の読み取りに失敗しました: {e}"),
                    ),
                );
                break;
            }
        }
    }
}

/// 標準エラー出力を 1 行ずつ中継する。
async fn forward_stderr(app: AppHandle, run_id: String, stderr: ChildStderr) {
    let mut lines = BufReader::new(stderr).lines();

    loop {
        match lines.next_line().await {
            Ok(Some(line)) => {
                if line.trim().is_empty() {
                    continue;
                }
                emit_event(&app, text_event(&run_id, PromptRunEventKind::Stderr, line));
            }
            Ok(None) => break,
            Err(e) => {
                emit_event(
                    &app,
                    text_event(
                        &run_id,
                        PromptRunEventKind::Stderr,
                        format!("標準エラー出力の読み取りに失敗しました: {e}"),
                    ),
                );
                break;
            }
        }
    }
}

/// テキスト系（stderr / error）イベントを作る。
fn text_event(run_id: &str, kind: PromptRunEventKind, text: String) -> PromptRunEvent {
    PromptRunEvent {
        run_id: run_id.to_string(),
        kind,
        payload: None,
        text: Some(text),
        exit_code: None,
        success: None,
    }
}

/// イベントを送信する。送信失敗は致命的ではないためログのみ。
fn emit_event(app: &AppHandle, event: PromptRunEvent) {
    if let Err(e) = app.emit(PROMPT_RUN_EVENT, event) {
        eprintln!("{PROMPT_RUN_EVENT} の送信に失敗しました: {e}");
    }
}
