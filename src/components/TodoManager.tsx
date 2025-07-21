import React, { useEffect, useState } from "react";
import { api } from "../api";
import type { TodoItem } from "../types";

interface TodoManagerProps {}

export const TodoManager: React.FC<TodoManagerProps> = () => {
  const [todos, setTodos] = useState<TodoItem[]>([]);
  const [filter, setFilter] = useState<
    "all" | "pending" | "in_progress" | "completed"
  >("all");
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    loadTodos();
  }, []);

  const loadTodos = async () => {
    try {
      setLoading(true);
      setError(null);
      const data = await api.getTodos();
      setTodos(data);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to load todos");
    } finally {
      setLoading(false);
    }
  };

  const filteredTodos = todos.filter((todo) => {
    if (filter === "all") return true;
    if (filter === "pending") return todo.status === "Pending";
    if (filter === "in_progress") return todo.status === "InProgress";
    if (filter === "completed") return todo.status === "Completed";
    return true;
  });

  const todosByStatus = {
    pending: todos.filter((t) => t.status === "Pending").length,
    in_progress: todos.filter((t) => t.status === "InProgress").length,
    completed: todos.filter((t) => t.status === "Completed").length,
  };

  const getStatusIcon = (status: string) => {
    switch (status) {
      case "Pending":
        return "⏳";
      case "InProgress":
        return "🔄";
      case "Completed":
        return "✅";
      default:
        return "❓";
    }
  };

  const getPriorityColor = (priority: string) => {
    switch (priority) {
      case "High":
        return "#ff4444";
      case "Medium":
        return "#ffaa44";
      case "Low":
        return "#44aa44";
      default:
        return "#888888";
    }
  };

  const exportTodos = async () => {
    try {
      const data = JSON.stringify(todos, null, 2);
      const blob = new Blob([data], { type: "application/json" });
      const url = URL.createObjectURL(blob);
      const a = document.createElement("a");
      a.href = url;
      a.download = "todos.json";
      document.body.appendChild(a);
      a.click();
      document.body.removeChild(a);
      URL.revokeObjectURL(url);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to export todos");
    }
  };

  if (error) {
    return (
      <div className="todo-manager-error">
        <h3>Error</h3>
        <p>{error}</p>
        <button onClick={loadTodos}>Retry</button>
      </div>
    );
  }

  return (
    <div className="todo-manager">
      <div className="todo-manager-header">
        <h2>TODO Manager</h2>
        <button onClick={exportTodos} className="export-button">
          Export All
        </button>
      </div>

      <div className="todo-stats">
        <div className="stat-item">
          <span className="stat-value">{todosByStatus.pending}</span>
          <span className="stat-label">Pending</span>
        </div>
        <div className="stat-item">
          <span className="stat-value">{todosByStatus.in_progress}</span>
          <span className="stat-label">In Progress</span>
        </div>
        <div className="stat-item">
          <span className="stat-value">{todosByStatus.completed}</span>
          <span className="stat-label">Completed</span>
        </div>
      </div>

      <div className="todo-filters">
        <button
          className={filter === "all" ? "active" : ""}
          onClick={() => setFilter("all")}
        >
          All ({todos.length})
        </button>
        <button
          className={filter === "pending" ? "active" : ""}
          onClick={() => setFilter("pending")}
        >
          Pending ({todosByStatus.pending})
        </button>
        <button
          className={filter === "in_progress" ? "active" : ""}
          onClick={() => setFilter("in_progress")}
        >
          In Progress ({todosByStatus.in_progress})
        </button>
        <button
          className={filter === "completed" ? "active" : ""}
          onClick={() => setFilter("completed")}
        >
          Completed ({todosByStatus.completed})
        </button>
      </div>

      <div className="todo-content">
        {loading ? (
          <div className="loading">Loading todos...</div>
        ) : filteredTodos.length === 0 ? (
          <div className="no-todos">No todos found for the selected filter</div>
        ) : (
          <div className="todos-list">
            {filteredTodos.map((todo) => (
              <div key={todo.id} className="todo-item">
                <div className="todo-header">
                  <div className="todo-status">
                    <span className="status-icon">
                      {getStatusIcon(todo.status)}
                    </span>
                    <span className="status-text">{todo.status}</span>
                  </div>
                  <div
                    className="todo-priority"
                    style={{ color: getPriorityColor(todo.priority) }}
                  >
                    {todo.priority} Priority
                  </div>
                </div>
                <div className="todo-content-text">{todo.content}</div>
                <div className="todo-id">ID: {todo.id}</div>
              </div>
            ))}
          </div>
        )}
      </div>
    </div>
  );
};
