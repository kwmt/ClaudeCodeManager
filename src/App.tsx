import React, { useState, useEffect } from "react";
import "./App.css";
import "./styles/editors.css";
import "./styles/design-tokens.css";
import "./styles/improved-settings.css";
import "./styles/command-history-migration.css";
import "./styles/prompt-runner.css";
import "./styles/prompt-runs.css";
import { Dashboard } from "./components/Dashboard";
import { SessionBrowser } from "./components/SessionBrowser";
import { ProjectScreen } from "./components/ProjectScreen";
import { CommandHistory } from "./components/CommandHistory";
import { TodoManager } from "./components/TodoManager";
import { SettingsEditor } from "./components/SettingsEditor";
import { ImprovedSettingsEditor } from "./components/improved/ImprovedSettingsEditor";
import { PromptsOverview } from "./components/PromptsOverview";
import {
  PromptRunsProvider,
  usePromptRuns,
} from "./contexts/PromptRunsContext";
import { api } from "./api";
import { setHomeDirCache } from "./utils/pathUtils";
import "./utils/improvedSettings"; // Initialize improved settings utilities

type Tab =
  | "dashboard"
  | "sessions"
  | "commands"
  | "todos"
  | "settings"
  | "project"
  | "prompts";

/**
 * ナビの Prompts ボタン。実行中の件数バッジを表示するため、
 * PromptRunsProvider 配下で hook を使う小コンポーネントに分離している。
 */
const PromptsNavButton: React.FC<{
  active: boolean;
  onClick: () => void;
}> = ({ active, onClick }) => {
  const { runningCount } = usePromptRuns();
  return (
    <button className={active ? "active" : ""} onClick={onClick}>
      Prompts
      {runningCount > 0 && (
        <span
          className="nav-running-badge"
          aria-label={`${runningCount} 件実行中`}
        >
          <span className="nav-running-badge__dot" aria-hidden="true" />
          {runningCount}
        </span>
      )}
    </button>
  );
};

function App() {
  const [activeTab, setActiveTab] = useState<Tab>("dashboard");
  const [selectedProjectPath, setSelectedProjectPath] = useState<string>("");
  // Prompt タブを開いた状態でプロジェクト画面へ遷移させるためのリクエスト。
  // 同じプロジェクトを連続で開いても効くよう nonce で毎回変化させる。
  const [promptTabRequest, setPromptTabRequest] = useState<{ nonce: number }>({
    nonce: 0,
  });

  // Enable improved settings editor with URL parameter or localStorage flag
  const [useImprovedSettings] = useState(() => {
    const urlParams = new URLSearchParams(window.location.search);
    const urlFlag = urlParams.get("improved-settings") === "true";
    const storageFlag =
      localStorage.getItem("claude-improved-settings") === "true";
    return urlFlag || storageFlag;
  });

  // Initialize project path mapping cache and home directory on app start
  useEffect(() => {
    const initializeApp = async () => {
      try {
        // Load project path mapping to initialize the cache
        await api.getProjectPathMapping();
        console.log("Project path mapping cache initialized");

        // Load home directory and initialize the cache
        const homeDir = await api.getHomeDirectory();
        setHomeDirCache(homeDir);
        console.log("Home directory cache initialized:", homeDir);
      } catch (error) {
        console.error("Failed to initialize app caches:", error);
      }
    };

    initializeApp();
  }, []);

  // File watcher and real-time updates disabled
  // useEffect(() => {
  //   // File watcher functionality removed
  // }, []);

  const navigateToProject = (projectPath: string) => {
    setSelectedProjectPath(projectPath);
    setActiveTab("project");
  };

  /** プロジェクト画面を Prompt タブが開いた状態で表示する */
  const navigateToProjectPrompt = (projectPath: string) => {
    setSelectedProjectPath(projectPath);
    setPromptTabRequest((prev) => ({ nonce: prev.nonce + 1 }));
    setActiveTab("project");
  };

  const navigateBackToDashboard = () => {
    setActiveTab("dashboard");
  };

  const renderActiveTab = () => {
    switch (activeTab) {
      case "dashboard":
        return (
          <Dashboard
            onProjectClick={navigateToProject}
            onOpenPromptRun={navigateToProjectPrompt}
            onOpenPromptsTab={() => setActiveTab("prompts")}
          />
        );
      case "sessions":
        return <SessionBrowser />;
      case "project":
        return (
          <ProjectScreen
            projectPath={selectedProjectPath}
            promptTabRequest={promptTabRequest}
          />
        );
      case "prompts":
        return <PromptsOverview onOpenProject={navigateToProjectPrompt} />;
      case "commands":
        return <CommandHistory />;
      case "todos":
        return <TodoManager />;
      case "settings":
        return useImprovedSettings ? (
          <ImprovedSettingsEditor />
        ) : (
          <SettingsEditor />
        );
      default:
        return <Dashboard onProjectClick={navigateToProject} />;
    }
  };

  return (
    <PromptRunsProvider>
      <div className="app">
        <nav className="nav">
          <h1
            className="nav-title clickable"
            onClick={navigateBackToDashboard}
            role="button"
            tabIndex={0}
            onKeyDown={(e) => {
              if (e.key === "Enter" || e.key === " ") {
                e.preventDefault();
                navigateBackToDashboard();
              }
            }}
            title="Back to Dashboard"
          >
            Claude Code Manager
          </h1>
          <div className="nav-tabs">
            <button
              className={activeTab === "dashboard" ? "active" : ""}
              onClick={() => setActiveTab("dashboard")}
            >
              Dashboard
            </button>
            <button
              className={activeTab === "sessions" ? "active" : ""}
              onClick={() => setActiveTab("sessions")}
            >
              Sessions
            </button>
            <button
              className={activeTab === "commands" ? "active" : ""}
              onClick={() => setActiveTab("commands")}
            >
              Commands
            </button>
            <button
              className={activeTab === "todos" ? "active" : ""}
              onClick={() => setActiveTab("todos")}
            >
              TODOs
            </button>
            <PromptsNavButton
              active={activeTab === "prompts"}
              onClick={() => setActiveTab("prompts")}
            />
            <button
              className={activeTab === "settings" ? "active" : ""}
              onClick={() => setActiveTab("settings")}
            >
              Settings
            </button>
          </div>
        </nav>
        <main className="main">{renderActiveTab()}</main>
      </div>
    </PromptRunsProvider>
  );
}

export default App;
