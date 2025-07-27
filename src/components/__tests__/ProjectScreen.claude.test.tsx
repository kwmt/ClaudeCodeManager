import { render, screen, fireEvent, waitFor } from "@testing-library/react";
import { vi, describe, it, expect, beforeEach } from "vitest";
import { ProjectScreen } from "../ProjectScreen";
import { api } from "../../api";
import type { ClaudeDirectoryInfo } from "../../types";

// Mock window.confirm for JSDOM
Object.defineProperty(window, "confirm", {
  value: vi.fn(() => true),
  writable: true,
});

// Mock the api module
vi.mock("../../api", () => ({
  api: {
    getAllSessions: vi.fn(),
    getProjectSummary: vi.fn(),
    getClaudeDirectoryInfo: vi.fn(),
    readClaudeFile: vi.fn(),
    writeClaudeFile: vi.fn(),
    getSessionMessages: vi.fn(),
    openSessionFile: vi.fn(),
  },
}));

// Mock the pathUtils module
vi.mock("../../utils/pathUtils", () => ({
  normalizeProjectPathSync: vi.fn((path) => path),
  getProjectDisplayName: vi.fn((path) => path.split("/").pop() || path),
  isPathInHomeDirectory: vi.fn(() => true),
}));

describe("ProjectScreen - .claude Directory Tab", () => {
  const mockProjectPath = "/Users/test/projects/my-project";

  beforeEach(() => {
    vi.clearAllMocks();
    // Reset window.confirm mock
    (window.confirm as any).mockReturnValue(true);

    // Set up default mocks
    vi.mocked(api.getAllSessions).mockResolvedValue([]);
    vi.mocked(api.getProjectSummary).mockResolvedValue([]);
    vi.mocked(api.getSessionMessages).mockResolvedValue([]);
  });

  it("should show .claude directory files when directory exists", async () => {
    const mockDirectoryInfo: ClaudeDirectoryInfo = {
      path: `${mockProjectPath}/.claude`,
      exists: true,
      files: [
        {
          name: "settings.json",
          path: `${mockProjectPath}/.claude/settings.json`,
          size: 512,
          modified: new Date().toISOString(),
          is_directory: false,
        },
        {
          name: "workspace.json",
          path: `${mockProjectPath}/.claude/workspace.json`,
          size: 1024,
          modified: new Date().toISOString(),
          is_directory: false,
        },
        {
          name: "hooks",
          path: `${mockProjectPath}/.claude/hooks`,
          size: 0,
          modified: new Date().toISOString(),
          is_directory: true,
        },
      ],
    };

    vi.mocked(api.getClaudeDirectoryInfo).mockResolvedValue(mockDirectoryInfo);

    render(<ProjectScreen projectPath={mockProjectPath} />);

    // Wait for initial load
    await waitFor(() => {
      expect(screen.queryByText("Loading project...")).not.toBeInTheDocument();
    });

    // Click on .claude Directory tab
    fireEvent.click(screen.getByText(".claude Directory"));

    // Wait for directory info to load
    await waitFor(() => {
      expect(api.getClaudeDirectoryInfo).toHaveBeenCalledWith(mockProjectPath);
    });

    // Check that files are displayed (directories are filtered out)
    expect(screen.getByText("settings.json")).toBeInTheDocument();
    expect(screen.getByText("workspace.json")).toBeInTheDocument();
    expect(screen.getByText("512 B")).toBeInTheDocument();
    expect(screen.getByText("1 KB")).toBeInTheDocument();
  });

  it("should show message when .claude directory does not exist", async () => {
    const mockDirectoryInfo: ClaudeDirectoryInfo = {
      path: `${mockProjectPath}/.claude`,
      exists: false,
      files: [],
    };

    vi.mocked(api.getClaudeDirectoryInfo).mockResolvedValue(mockDirectoryInfo);

    render(<ProjectScreen projectPath={mockProjectPath} />);

    await waitFor(() => {
      expect(screen.queryByText("Loading project...")).not.toBeInTheDocument();
    });

    fireEvent.click(screen.getByText(".claude Directory"));

    await waitFor(() => {
      expect(
        screen.getByText("No .claude directory found in this project."),
      ).toBeInTheDocument();
      expect(
        screen.getByText(`Expected at: ${mockProjectPath}/.claude`),
      ).toBeInTheDocument();
    });
  });

  it("should load and display file content when file is clicked", async () => {
    const mockDirectoryInfo: ClaudeDirectoryInfo = {
      path: `${mockProjectPath}/.claude`,
      exists: true,
      files: [
        {
          name: "settings.json",
          path: `${mockProjectPath}/.claude/settings.json`,
          size: 512,
          modified: new Date().toISOString(),
          is_directory: false,
        },
      ],
    };

    const mockFileContent = JSON.stringify({ test: true }, null, 2);

    vi.mocked(api.getClaudeDirectoryInfo).mockResolvedValue(mockDirectoryInfo);
    vi.mocked(api.readClaudeFile).mockResolvedValue(mockFileContent);

    render(<ProjectScreen projectPath={mockProjectPath} />);

    await waitFor(() => {
      expect(screen.queryByText("Loading project...")).not.toBeInTheDocument();
    });

    fireEvent.click(screen.getByText(".claude Directory"));

    await waitFor(() => {
      expect(screen.getByText("settings.json")).toBeInTheDocument();
    });

    // Click on the file
    fireEvent.click(screen.getByText("settings.json"));

    await waitFor(() => {
      expect(api.readClaudeFile).toHaveBeenCalledWith(
        `${mockProjectPath}/.claude/settings.json`,
      );
      // Check that the file content is displayed within a pre element
      const preElement = document.querySelector("pre.file-viewer");
      expect(preElement).toBeTruthy();
      expect(preElement?.textContent).toBe(mockFileContent);
    });

    // Check that Edit button is present
    expect(screen.getByText("Edit")).toBeInTheDocument();
  });

  it("should allow editing and saving file content", async () => {
    const mockDirectoryInfo: ClaudeDirectoryInfo = {
      path: `${mockProjectPath}/.claude`,
      exists: true,
      files: [
        {
          name: "settings.json",
          path: `${mockProjectPath}/.claude/settings.json`,
          size: 512,
          modified: new Date().toISOString(),
          is_directory: false,
        },
      ],
    };

    const originalContent = JSON.stringify({ test: true }, null, 2);
    const newContent = JSON.stringify({ test: false }, null, 2);

    vi.mocked(api.getClaudeDirectoryInfo).mockResolvedValue(mockDirectoryInfo);
    vi.mocked(api.readClaudeFile).mockResolvedValue(originalContent);
    vi.mocked(api.writeClaudeFile).mockResolvedValue(undefined);

    render(<ProjectScreen projectPath={mockProjectPath} />);

    await waitFor(() => {
      expect(screen.queryByText("Loading project...")).not.toBeInTheDocument();
    });

    fireEvent.click(screen.getByText(".claude Directory"));

    await waitFor(() => {
      expect(screen.getByText("settings.json")).toBeInTheDocument();
    });

    fireEvent.click(screen.getByText("settings.json"));

    await waitFor(() => {
      const preElement = document.querySelector("pre.file-viewer");
      expect(preElement).toBeTruthy();
      expect(preElement?.textContent).toBe(originalContent);
    });

    // Click Edit button
    fireEvent.click(screen.getByText("Edit"));

    // Find the textarea and change its value
    const textarea = screen.getByRole("textbox") as HTMLTextAreaElement;
    fireEvent.change(textarea, { target: { value: newContent } });

    // Click Save button
    fireEvent.click(screen.getByText("Save"));

    await waitFor(() => {
      expect(api.writeClaudeFile).toHaveBeenCalledWith(
        `${mockProjectPath}/.claude/settings.json`,
        newContent,
      );
      // After save, should reload directory info
      expect(api.getClaudeDirectoryInfo).toHaveBeenCalledTimes(2);
    });
  });

  it("should cancel editing when Cancel button is clicked", async () => {
    const mockDirectoryInfo: ClaudeDirectoryInfo = {
      path: `${mockProjectPath}/.claude`,
      exists: true,
      files: [
        {
          name: "settings.json",
          path: `${mockProjectPath}/.claude/settings.json`,
          size: 512,
          modified: new Date().toISOString(),
          is_directory: false,
        },
      ],
    };

    const originalContent = JSON.stringify({ test: true }, null, 2);

    vi.mocked(api.getClaudeDirectoryInfo).mockResolvedValue(mockDirectoryInfo);
    vi.mocked(api.readClaudeFile).mockResolvedValue(originalContent);

    render(<ProjectScreen projectPath={mockProjectPath} />);

    await waitFor(() => {
      expect(screen.queryByText("Loading project...")).not.toBeInTheDocument();
    });

    fireEvent.click(screen.getByText(".claude Directory"));

    await waitFor(() => {
      expect(screen.getByText("settings.json")).toBeInTheDocument();
    });

    fireEvent.click(screen.getByText("settings.json"));

    await waitFor(() => {
      const preElement = document.querySelector("pre.file-viewer");
      expect(preElement).toBeTruthy();
      expect(preElement?.textContent).toBe(originalContent);
    });

    // Click Edit button
    fireEvent.click(screen.getByText("Edit"));

    // Change the textarea value
    const textarea = screen.getByRole("textbox") as HTMLTextAreaElement;
    fireEvent.change(textarea, { target: { value: "modified content" } });

    // Click Cancel button
    fireEvent.click(screen.getByText("Cancel"));

    // Should revert to view mode and show original content
    const preElement = document.querySelector("pre.file-viewer");
    expect(preElement).toBeTruthy();
    expect(preElement?.textContent).toBe(originalContent);
    expect(screen.queryByRole("textbox")).not.toBeInTheDocument();
    expect(api.writeClaudeFile).not.toHaveBeenCalled();
  });

  it("should format file sizes correctly", async () => {
    const mockDirectoryInfo: ClaudeDirectoryInfo = {
      path: `${mockProjectPath}/.claude`,
      exists: true,
      files: [
        {
          name: "small.txt",
          path: `${mockProjectPath}/.claude/small.txt`,
          size: 100,
          modified: new Date().toISOString(),
          is_directory: false,
        },
        {
          name: "medium.txt",
          path: `${mockProjectPath}/.claude/medium.txt`,
          size: 1536,
          modified: new Date().toISOString(),
          is_directory: false,
        },
        {
          name: "large.txt",
          path: `${mockProjectPath}/.claude/large.txt`,
          size: 1048576,
          modified: new Date().toISOString(),
          is_directory: false,
        },
      ],
    };

    vi.mocked(api.getClaudeDirectoryInfo).mockResolvedValue(mockDirectoryInfo);

    render(<ProjectScreen projectPath={mockProjectPath} />);

    await waitFor(() => {
      expect(screen.queryByText("Loading project...")).not.toBeInTheDocument();
    });

    fireEvent.click(screen.getByText(".claude Directory"));

    await waitFor(() => {
      expect(screen.getByText("100 B")).toBeInTheDocument();
      expect(screen.getByText("1.5 KB")).toBeInTheDocument();
      expect(screen.getByText("1 MB")).toBeInTheDocument();
    });
  });
});
