import { useState, useEffect } from "react";
import "./App.css";
import { Dashboard } from "./components/Dashboard";
import { SessionBrowser } from "./components/SessionBrowser";
import { ProjectScreen } from "./components/ProjectScreen";
import { CommandHistory } from "./components/CommandHistory";
import { TodoManager } from "./components/TodoManager";
import { SettingsEditor } from "./components/SettingsEditor";
import { api } from "./api";
import { setHomeDirCache } from "./utils/pathUtils";

type Tab =
  | "dashboard"
  | "sessions"
  | "commands"
  | "todos"
  | "settings"
  | "project";

function App() {
  const [activeTab, setActiveTab] = useState<Tab>("dashboard");
  const [selectedProjectPath, setSelectedProjectPath] = useState<string>("");

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

  const navigateBackToDashboard = () => {
    setActiveTab("dashboard");
  };

  const renderActiveTab = () => {
    switch (activeTab) {
      case "dashboard":
        return <Dashboard onProjectClick={navigateToProject} />;
      case "sessions":
        return <SessionBrowser />;
      case "project":
        return (
          <ProjectScreen
            projectPath={selectedProjectPath}
            onBack={navigateBackToDashboard}
          />
        );
      case "commands":
        return <CommandHistory />;
      case "todos":
        return <TodoManager />;
      case "settings":
        return <SettingsEditor />;
      default:
        return <Dashboard onProjectClick={navigateToProject} />;
    }
  };

  return (
    <div className="app">
      <nav className="nav">
        <h1 className="nav-title">Claude Code Manager</h1>
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
  );
}

export default App;
