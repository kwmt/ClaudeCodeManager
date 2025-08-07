/**
 * CommandHistory 段階的移行制御システム
 *
 * ユーザー中心設計に基づく安全で透明な移行プロセスを提供
 * - A/Bテスト環境
 * - 段階的ロールアウト（4フェーズ）
 * - パフォーマンス監視
 * - 自動ロールバック機能
 */

export type MigrationPhase =
  | "phase-0"
  | "phase-1"
  | "phase-2"
  | "phase-3"
  | "phase-4";

export interface MigrationConfig {
  phase: MigrationPhase;
  rolloutPercentage: number;
  isEnabled: boolean;
  lastUpdated: string;
  performanceThresholds: {
    maxSearchTime: number; // ms
    maxMemoryUsage: number; // MB
    maxErrorRate: number; // %
  };
}

export interface AnalyticsData {
  userId: string;
  sessionId: string;
  componentType: "legacy" | "improved";
  metrics: {
    searchTime: number[];
    memoryUsage: number[];
    errorCount: number;
    totalInteractions: number;
    satisfactionScore?: number;
    accessibilityScore?: number;
  };
  userAgent: string;
  timestamp: string;
}

class ImprovedCommandHistoryManager {
  private readonly STORAGE_KEY = "claude-command-history-migration";
  private readonly SESSION_KEY = "claude-session-id";
  private readonly ANALYTICS_KEY = "claude-command-history-analytics";

  // 段階的ロールアウト設定
  private readonly PHASE_CONFIG: Record<
    MigrationPhase,
    { percentage: number; description: string }
  > = {
    "phase-0": { percentage: 0, description: "開発者・内部テスター限定" },
    "phase-1": { percentage: 5, description: "限定ベータテスト" },
    "phase-2": { percentage: 25, description: "段階的展開" },
    "phase-3": { percentage: 75, description: "大規模展開" },
    "phase-4": { percentage: 100, description: "全ユーザー" },
  };

  // デフォルト設定
  private readonly DEFAULT_CONFIG: MigrationConfig = {
    phase: "phase-0",
    rolloutPercentage: 0,
    isEnabled: false,
    lastUpdated: new Date().toISOString(),
    performanceThresholds: {
      maxSearchTime: 200, // 200ms以下
      maxMemoryUsage: 50, // 50MB以下
      maxErrorRate: 0.1, // 0.1%以下
    },
  };

  /**
   * 現在の移行設定を取得
   */
  getConfig(): MigrationConfig {
    try {
      const stored = localStorage.getItem(this.STORAGE_KEY);
      if (stored) {
        return { ...this.DEFAULT_CONFIG, ...JSON.parse(stored) };
      }
    } catch (error) {
      console.warn("Failed to load migration config:", error);
    }
    return this.DEFAULT_CONFIG;
  }

  /**
   * 移行設定を更新
   */
  updateConfig(updates: Partial<MigrationConfig>): void {
    const current = this.getConfig();
    const updated = {
      ...current,
      ...updates,
      lastUpdated: new Date().toISOString(),
    };

    localStorage.setItem(this.STORAGE_KEY, JSON.stringify(updated));
    this.logAnalytics("config_updated", { updates });
  }

  /**
   * URLパラメータによる強制モード検出
   */
  private getUrlOverride(): boolean | null {
    const params = new URLSearchParams(window.location.search);
    const override = params.get("improved-commands");

    if (override === "true") return true;
    if (override === "false") return false;
    return null;
  }

  /**
   * ブラウザフィンガープリントによる一貫したA/Bテスト分割
   */
  private getBrowserFingerprint(): string {
    const canvas = document.createElement("canvas");
    const ctx = canvas.getContext("2d");
    if (ctx) {
      ctx.textBaseline = "top";
      ctx.font = "14px Arial";
      ctx.fillText("Claude Code Manager", 2, 2);
    }

    const fingerprint = [
      navigator.userAgent,
      navigator.language,
      screen.width + "x" + screen.height,
      new Date().getTimezoneOffset(),
      canvas.toDataURL(),
    ].join("|");

    // 簡単なハッシュ関数
    let hash = 0;
    for (let i = 0; i < fingerprint.length; i++) {
      const char = fingerprint.charCodeAt(i);
      hash = (hash << 5) - hash + char;
      hash = hash & hash; // 32bit整数に変換
    }

    return Math.abs(hash).toString();
  }

  /**
   * ユーザーが改良版を表示すべきかを判定
   */
  shouldShowImproved(): boolean {
    // URLパラメータでの強制モード
    const urlOverride = this.getUrlOverride();
    if (urlOverride !== null) {
      this.logAnalytics("url_override", { forced: urlOverride });
      return urlOverride;
    }

    const config = this.getConfig();

    // 開発環境では常に利用可能
    if (process.env.NODE_ENV === "development") {
      return config.isEnabled;
    }

    // フェーズ別ロールアウト判定
    const targetPercentage = this.PHASE_CONFIG[config.phase].percentage;
    if (targetPercentage === 0) return false;
    if (targetPercentage === 100) return true;

    // ブラウザフィンガープリントによる一貫したセグメンテーション
    const fingerprint = this.getBrowserFingerprint();
    const hashValue = parseInt(fingerprint, 10);
    const userPercentile = hashValue % 100;

    const shouldShow = userPercentile < targetPercentage;

    this.logAnalytics("rollout_decision", {
      phase: config.phase,
      targetPercentage,
      userPercentile,
      shouldShow,
      fingerprint: fingerprint.substring(0, 8), // プライバシー保護のため一部のみ
    });

    return shouldShow;
  }

  /**
   * フェーズを次に進める
   */
  advancePhase(): void {
    const current = this.getConfig();
    const phases: MigrationPhase[] = [
      "phase-0",
      "phase-1",
      "phase-2",
      "phase-3",
      "phase-4",
    ];
    const currentIndex = phases.indexOf(current.phase);

    if (currentIndex < phases.length - 1) {
      const nextPhase = phases[currentIndex + 1];
      this.updateConfig({
        phase: nextPhase,
        rolloutPercentage: this.PHASE_CONFIG[nextPhase].percentage,
      });

      console.log(
        `Advanced to ${nextPhase}: ${this.PHASE_CONFIG[nextPhase].description}`,
      );
    }
  }

  /**
   * 緊急ロールバック
   */
  emergencyRollback(reason: string): void {
    this.updateConfig({
      phase: "phase-0",
      rolloutPercentage: 0,
      isEnabled: false,
    });

    this.logAnalytics("emergency_rollback", { reason });
    console.warn(`Emergency rollback triggered: ${reason}`);

    // ページ再読み込みで即座にレガシー版に戻す
    window.location.reload();
  }

  /**
   * パフォーマンス指標を記録・監視
   */
  recordPerformance(type: "search" | "memory" | "error", value: number): void {
    const config = this.getConfig();
    const thresholds = config.performanceThresholds;

    // 閾値チェック
    let shouldRollback = false;
    let reason = "";

    switch (type) {
      case "search":
        if (value > thresholds.maxSearchTime) {
          shouldRollback = true;
          reason = `Search time exceeded threshold: ${value}ms > ${thresholds.maxSearchTime}ms`;
        }
        break;
      case "memory":
        if (value > thresholds.maxMemoryUsage) {
          shouldRollback = true;
          reason = `Memory usage exceeded threshold: ${value}MB > ${thresholds.maxMemoryUsage}MB`;
        }
        break;
      case "error":
        if (value > thresholds.maxErrorRate) {
          shouldRollback = true;
          reason = `Error rate exceeded threshold: ${value}% > ${thresholds.maxErrorRate}%`;
        }
        break;
    }

    // パフォーマンスデータ記録
    this.logAnalytics("performance_metric", {
      type,
      value,
      threshold:
        type === "search"
          ? thresholds.maxSearchTime
          : type === "memory"
            ? thresholds.maxMemoryUsage
            : thresholds.maxErrorRate,
      exceeded: shouldRollback,
    });

    // 自動ロールバック
    if (shouldRollback) {
      this.emergencyRollback(reason);
    }
  }

  /**
   * ユーザーフィードバックを収集
   */
  collectFeedback(satisfactionScore: number, feedback?: string): void {
    this.logAnalytics("user_feedback", {
      satisfactionScore,
      feedback,
      componentType: this.shouldShowImproved() ? "improved" : "legacy",
    });
  }

  /**
   * アクセシビリティスコアを記録
   */
  recordAccessibilityScore(score: number): void {
    this.logAnalytics("accessibility_score", {
      score,
      componentType: this.shouldShowImproved() ? "improved" : "legacy",
    });
  }

  /**
   * 分析データをローカルストレージに記録
   */
  private logAnalytics(event: string, data: any): void {
    try {
      const sessionId = this.getOrCreateSessionId();
      const userId = this.getBrowserFingerprint();

      const analyticsEntry = {
        sessionId,
        userId,
        event,
        data,
        timestamp: new Date().toISOString(),
        userAgent: navigator.userAgent,
        url: window.location.href,
      };

      const existingAnalytics = JSON.parse(
        localStorage.getItem(this.ANALYTICS_KEY) || "[]",
      );
      existingAnalytics.push(analyticsEntry);

      // 最新1000件のみ保持
      if (existingAnalytics.length > 1000) {
        existingAnalytics.splice(0, existingAnalytics.length - 1000);
      }

      localStorage.setItem(
        this.ANALYTICS_KEY,
        JSON.stringify(existingAnalytics),
      );
    } catch (error) {
      console.warn("Failed to log analytics:", error);
    }
  }

  /**
   * セッションIDを取得または作成
   */
  private getOrCreateSessionId(): string {
    let sessionId = sessionStorage.getItem(this.SESSION_KEY);
    if (!sessionId) {
      sessionId =
        Date.now().toString(36) + Math.random().toString(36).substr(2);
      sessionStorage.setItem(this.SESSION_KEY, sessionId);
    }
    return sessionId;
  }

  /**
   * 分析データを取得（開発者用）
   */
  getAnalytics(): any[] {
    try {
      return JSON.parse(localStorage.getItem(this.ANALYTICS_KEY) || "[]");
    } catch {
      return [];
    }
  }

  /**
   * 分析データをクリア（開発者用）
   */
  clearAnalytics(): void {
    localStorage.removeItem(this.ANALYTICS_KEY);
  }

  /**
   * 現在のステータスを取得（開発者用）
   */
  getStatus(): any {
    const config = this.getConfig();
    const shouldShow = this.shouldShowImproved();
    const analytics = this.getAnalytics();

    return {
      config,
      shouldShow,
      analyticsCount: analytics.length,
      fingerprint: this.getBrowserFingerprint().substring(0, 8),
      sessionId: this.getOrCreateSessionId(),
      urlOverride: this.getUrlOverride(),
      environment: process.env.NODE_ENV,
    };
  }
}

// シングルトンインスタンス
export const commandHistoryMigration = new ImprovedCommandHistoryManager();

// 開発者向けグローバルAPI
if (typeof window !== "undefined") {
  (window as any).claudeCommands = {
    getStatus: () => commandHistoryMigration.getStatus(),
    getAnalytics: () => commandHistoryMigration.getAnalytics(),
    clearAnalytics: () => commandHistoryMigration.clearAnalytics(),
    enable: () => commandHistoryMigration.updateConfig({ isEnabled: true }),
    disable: () => commandHistoryMigration.updateConfig({ isEnabled: false }),
    setPhase: (phase: MigrationPhase) =>
      commandHistoryMigration.updateConfig({ phase }),
    advancePhase: () => commandHistoryMigration.advancePhase(),
    emergency: (reason: string) =>
      commandHistoryMigration.emergencyRollback(reason),
    feedback: (score: number, comment?: string) =>
      commandHistoryMigration.collectFeedback(score, comment),
  };
}
