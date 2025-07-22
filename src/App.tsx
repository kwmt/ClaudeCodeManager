import { useState } from "react";
import "./App.css";
import { Dashboard } from "./components/Dashboard";
import { SessionBrowser } from "./components/SessionBrowser";
import { CommandHistory } from "./components/CommandHistory";
import { TodoManager } from "./components/TodoManager";
import { SettingsEditor } from "./components/SettingsEditor";

type Tab = "dashboard" | "sessions" | "commands" | "todos" | "settings";

function App() {
  const [activeTab, setActiveTab] = useState<Tab>("dashboard");
  const [sessionProjectFilter, setSessionProjectFilter] =
    useState<string>("all");

  // File watcher and real-time updates disabled
  // useEffect(() => {
  //   // File watcher functionality removed
  // }, []);

  const navigateToSessionsWithProject = (projectPath: string) => {
    setSessionProjectFilter(projectPath);
    setActiveTab("sessions");
  };

  const renderActiveTab = () => {
    switch (activeTab) {
      case "dashboard":
        return <Dashboard onProjectClick={navigateToSessionsWithProject} />;
      case "sessions":
        return <SessionBrowser initialProjectFilter={sessionProjectFilter} />;
      case "commands":
        return <CommandHistory />;
      case "todos":
        return <TodoManager />;
      case "settings":
        return <SettingsEditor />;
      default:
        return <Dashboard onProjectClick={navigateToSessionsWithProject} />;
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
