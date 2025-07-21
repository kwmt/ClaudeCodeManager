import { useState, useEffect } from "react";
import "./App.css";
import { Dashboard } from "./components/Dashboard";
import { SessionBrowser } from "./components/SessionBrowser";
import { CommandHistory } from "./components/CommandHistory";
import { TodoManager } from "./components/TodoManager";
import { SettingsEditor } from "./components/SettingsEditor";
import { api } from "./api";

type Tab = "dashboard" | "sessions" | "commands" | "todos" | "settings";

function App() {
  const [activeTab, setActiveTab] = useState<Tab>("dashboard");

  useEffect(() => {
    // Start file watcher when app loads
    const startWatcher = async () => {
      try {
        await api.startFileWatcher();
      } catch (error) {
        console.error("Failed to start file watcher:", error);
      }
    };

    startWatcher();

    // Listen for file change events
    const setupEventListener = async () => {
      try {
        // Check if we're in Tauri environment
        const { listen } = await import("@tauri-apps/api/event");

        const unlisten = await listen("file-changed", (event) => {
          console.log("File changed:", event.payload);
          // Trigger a refresh of components by emitting a custom event
          window.dispatchEvent(new CustomEvent("claude-data-changed"));
        });

        return unlisten;
      } catch (error) {
        console.log("Not in Tauri environment, skipping event listener");
        return null;
      }
    };

    let unlisten: (() => void) | null = null;
    setupEventListener().then((fn) => {
      unlisten = fn;
    });

    return () => {
      if (unlisten) {
        unlisten();
      }
    };
  }, []);

  const renderActiveTab = () => {
    switch (activeTab) {
      case "dashboard":
        return <Dashboard />;
      case "sessions":
        return <SessionBrowser />;
      case "commands":
        return <CommandHistory />;
      case "todos":
        return <TodoManager />;
      case "settings":
        return <SettingsEditor />;
      default:
        return <Dashboard />;
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
