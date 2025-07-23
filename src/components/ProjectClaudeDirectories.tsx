import React, { useState, useEffect } from "react";
import { api } from "../api";
import type { ProjectClaudeDirectory } from "../types";

const ProjectClaudeDirectories: React.FC = () => {
  const [directories, setDirectories] = useState<ProjectClaudeDirectory[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [expandedProjects, setExpandedProjects] = useState<Set<string>>(
    new Set(),
  );

  useEffect(() => {
    loadDirectories();
  }, []);

  const loadDirectories = async () => {
    try {
      setLoading(true);
      const data = await api.getProjectClaudeDirectories();
      setDirectories(data);
    } catch (err) {
      setError(
        err instanceof Error
          ? err.message
          : "Failed to load project directories",
      );
    } finally {
      setLoading(false);
    }
  };

  const toggleProject = (projectPath: string) => {
    const newExpanded = new Set(expandedProjects);
    if (newExpanded.has(projectPath)) {
      newExpanded.delete(projectPath);
    } else {
      newExpanded.add(projectPath);
    }
    setExpandedProjects(newExpanded);
  };

  const renderJsonValue = (value: any, key: string = ""): React.ReactNode => {
    if (value === null || value === undefined) {
      return <span className="text-gray-400">null</span>;
    }

    if (typeof value === "boolean") {
      return (
        <span className={value ? "text-green-600" : "text-red-600"}>
          {value.toString()}
        </span>
      );
    }

    if (typeof value === "string") {
      return <span className="text-blue-600">"{value}"</span>;
    }

    if (typeof value === "number") {
      return <span className="text-purple-600">{value}</span>;
    }

    if (Array.isArray(value)) {
      if (value.length === 0) {
        return <span className="text-gray-400">[]</span>;
      }
      return (
        <div className="ml-4">
          <span className="text-gray-600">[</span>
          {value.map((item, index) => (
            <div key={index} className="ml-2">
              {renderJsonValue(item, `${key}[${index}]`)}
              {index < value.length - 1 && (
                <span className="text-gray-600">,</span>
              )}
            </div>
          ))}
          <span className="text-gray-600">]</span>
        </div>
      );
    }

    if (typeof value === "object") {
      const entries = Object.entries(value);
      if (entries.length === 0) {
        return <span className="text-gray-400">{"{}"}</span>;
      }
      return (
        <div className="ml-4">
          <span className="text-gray-600">{"{"}</span>
          {entries.map(([k, v], index) => (
            <div key={k} className="ml-2">
              <span className="text-orange-600">"{k}"</span>
              <span className="text-gray-600">: </span>
              {renderJsonValue(v, `${key}.${k}`)}
              {index < entries.length - 1 && (
                <span className="text-gray-600">,</span>
              )}
            </div>
          ))}
          <span className="text-gray-600">{"}"}</span>
        </div>
      );
    }

    return <span>{String(value)}</span>;
  };

  if (loading) {
    return (
      <div className="flex items-center justify-center p-8">
        <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-blue-500"></div>
        <span className="ml-3 text-gray-600">
          Loading project .claude directories...
        </span>
      </div>
    );
  }

  if (error) {
    return (
      <div className="p-4 bg-red-50 border border-red-200 rounded-lg">
        <div className="flex items-center">
          <div className="text-red-400">⚠️</div>
          <div className="ml-3">
            <h3 className="text-sm font-medium text-red-800">
              Error loading directories
            </h3>
            <p className="text-sm text-red-600 mt-1">{error}</p>
          </div>
        </div>
        <button
          onClick={loadDirectories}
          className="mt-3 px-3 py-1 bg-red-100 text-red-800 rounded text-sm hover:bg-red-200"
        >
          Try Again
        </button>
      </div>
    );
  }

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between">
        <h2 className="text-xl font-semibold text-gray-900">
          Project .claude Directories
        </h2>
        <button
          onClick={loadDirectories}
          className="px-3 py-1 text-sm bg-blue-100 text-blue-800 rounded hover:bg-blue-200"
        >
          Refresh
        </button>
      </div>

      {directories.length === 0 ? (
        <div className="text-center py-8 text-gray-500">
          No projects found with session data.
        </div>
      ) : (
        <div className="space-y-3">
          {directories.map((dir) => (
            <div
              key={dir.project_path}
              className="border border-gray-200 rounded-lg overflow-hidden"
            >
              <div
                className="p-4 bg-gray-50 cursor-pointer hover:bg-gray-100 transition-colors"
                onClick={() => toggleProject(dir.project_path)}
              >
                <div className="flex items-center justify-between">
                  <div className="flex items-center space-x-3">
                    <span className="text-lg">
                      {expandedProjects.has(dir.project_path) ? "📂" : "📁"}
                    </span>
                    <div>
                      <h3 className="font-medium text-gray-900">
                        {dir.project_path}
                      </h3>
                      <div className="flex items-center space-x-4 text-sm text-gray-500 mt-1">
                        <span
                          className={`px-2 py-1 rounded-full text-xs ${
                            dir.exists
                              ? "bg-green-100 text-green-800"
                              : "bg-gray-100 text-gray-600"
                          }`}
                        >
                          {dir.exists
                            ? ".claude directory exists"
                            : "No .claude directory"}
                        </span>
                        {dir.commands_dir && (
                          <span className="bg-blue-100 text-blue-800 px-2 py-1 rounded-full text-xs">
                            {dir.commands_dir.commands.length} commands
                          </span>
                        )}
                      </div>
                    </div>
                  </div>
                  <div className="text-gray-400">
                    {expandedProjects.has(dir.project_path) ? "▼" : "▶"}
                  </div>
                </div>
              </div>

              {expandedProjects.has(dir.project_path) && (
                <div className="p-4 border-t border-gray-200 bg-white">
                  {!dir.exists ? (
                    <p className="text-gray-500 italic">
                      This project does not have a .claude directory.
                    </p>
                  ) : (
                    <div className="space-y-4">
                      <div>
                        <h4 className="font-medium text-gray-700 mb-1">
                          Directory Path
                        </h4>
                        <code className="text-sm bg-gray-100 px-2 py-1 rounded">
                          {dir.claude_dir_path}
                        </code>
                      </div>

                      {dir.commands_dir &&
                        dir.commands_dir.commands.length > 0 && (
                          <div>
                            <h4 className="font-medium text-gray-700 mb-2">
                              Commands
                            </h4>
                            <div className="space-y-2">
                              {dir.commands_dir.commands.map((cmd, index) => (
                                <div
                                  key={index}
                                  className="border border-gray-200 rounded p-3"
                                >
                                  <div className="flex items-center justify-between mb-2">
                                    <h5 className="font-medium text-gray-800">
                                      {cmd.name}
                                    </h5>
                                    <code className="text-xs bg-gray-100 px-2 py-1 rounded">
                                      {cmd.path}
                                    </code>
                                  </div>
                                  <div className="bg-gray-50 p-3 rounded text-sm">
                                    <pre className="whitespace-pre-wrap text-gray-700">
                                      {cmd.content}
                                    </pre>
                                  </div>
                                </div>
                              ))}
                            </div>
                          </div>
                        )}

                      {dir.settings_local && (
                        <div>
                          <h4 className="font-medium text-gray-700 mb-2">
                            Local Settings (settings.local.json)
                          </h4>
                          <div className="bg-gray-50 p-3 rounded text-sm font-mono">
                            {renderJsonValue(dir.settings_local)}
                          </div>
                        </div>
                      )}

                      {dir.settings && (
                        <div>
                          <h4 className="font-medium text-gray-700 mb-2">
                            Settings (settings.json)
                          </h4>
                          <div className="bg-gray-50 p-3 rounded text-sm font-mono">
                            {renderJsonValue(dir.settings)}
                          </div>
                        </div>
                      )}
                    </div>
                  )}
                </div>
              )}
            </div>
          ))}
        </div>
      )}
    </div>
  );
};

export default ProjectClaudeDirectories;
