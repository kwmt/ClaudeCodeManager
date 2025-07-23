import { render, screen, waitFor, fireEvent } from "@testing-library/react";
import { vi, describe, it, expect, beforeEach } from "vitest";
import ProjectClaudeDirectories from "../components/ProjectClaudeDirectories";
import * as api from "../api";

// Mock the API
vi.mock("../api", () => ({
  api: {
    getProjectClaudeDirectories: vi.fn(),
  },
}));

const mockApi = api.api as any;

describe("ProjectClaudeDirectories", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("renders loading state initially", () => {
    mockApi.getProjectClaudeDirectories.mockReturnValue(new Promise(() => {}));

    render(<ProjectClaudeDirectories />);
    expect(
      screen.getByText("Loading project .claude directories..."),
    ).toBeInTheDocument();
  });

  it("renders error state when API call fails", async () => {
    const errorMessage = "Failed to load directories";
    mockApi.getProjectClaudeDirectories.mockRejectedValue(
      new Error(errorMessage),
    );

    render(<ProjectClaudeDirectories />);

    await waitFor(() => {
      expect(screen.getByText("Error loading directories")).toBeInTheDocument();
      expect(screen.getByText(errorMessage)).toBeInTheDocument();
    });
  });

  it("renders empty state when no projects found", async () => {
    mockApi.getProjectClaudeDirectories.mockResolvedValue([]);

    render(<ProjectClaudeDirectories />);

    await waitFor(() => {
      expect(
        screen.getByText("No projects found with session data."),
      ).toBeInTheDocument();
    });
  });

  it("renders project directories with basic information", async () => {
    const mockDirectories = [
      {
        project_path: "/Users/developer/projects/web-app",
        claude_dir_path: "/Users/developer/projects/web-app/.claude",
        exists: true,
        commands_dir: {
          path: "/Users/developer/projects/web-app/.claude/commands",
          commands: [
            {
              name: "build.md",
              path: "/Users/developer/projects/web-app/.claude/commands/build.md",
              content: "# Build Command\n\nnpm run build",
            },
          ],
        },
        settings_local: {
          permissions: {
            defaultMode: "accept",
          },
        },
      },
      {
        project_path: "/Users/developer/projects/api-server",
        claude_dir_path: "/Users/developer/projects/api-server/.claude",
        exists: false,
      },
    ];

    mockApi.getProjectClaudeDirectories.mockResolvedValue(mockDirectories);

    render(<ProjectClaudeDirectories />);

    await waitFor(() => {
      expect(
        screen.getByText("Project .claude Directories"),
      ).toBeInTheDocument();
      expect(
        screen.getByText("/Users/developer/projects/web-app"),
      ).toBeInTheDocument();
      expect(
        screen.getByText("/Users/developer/projects/api-server"),
      ).toBeInTheDocument();
      expect(screen.getByText(".claude directory exists")).toBeInTheDocument();
      expect(screen.getByText("No .claude directory")).toBeInTheDocument();
      expect(screen.getByText("1 commands")).toBeInTheDocument();
    });
  });

  it("expands and collapses project details when clicked", async () => {
    const mockDirectories = [
      {
        project_path: "/Users/developer/projects/web-app",
        claude_dir_path: "/Users/developer/projects/web-app/.claude",
        exists: true,
        commands_dir: {
          path: "/Users/developer/projects/web-app/.claude/commands",
          commands: [
            {
              name: "build.md",
              path: "/Users/developer/projects/web-app/.claude/commands/build.md",
              content: "# Build Command\n\nnpm run build",
            },
          ],
        },
        settings_local: {
          permissions: {
            defaultMode: "accept",
          },
        },
      },
    ];

    mockApi.getProjectClaudeDirectories.mockResolvedValue(mockDirectories);

    render(<ProjectClaudeDirectories />);

    await waitFor(() => {
      expect(
        screen.getByText("/Users/developer/projects/web-app"),
      ).toBeInTheDocument();
    });

    // Initially collapsed, should not show details
    expect(screen.queryByText("Directory Path")).not.toBeInTheDocument();
    expect(screen.queryByText("Commands")).not.toBeInTheDocument();

    // Click to expand
    const projectHeader = screen
      .getByText("/Users/developer/projects/web-app")
      .closest("div");
    if (projectHeader?.parentElement) {
      fireEvent.click(projectHeader.parentElement);
    }

    await waitFor(() => {
      expect(screen.getByText("Directory Path")).toBeInTheDocument();
      expect(screen.getByText("Commands")).toBeInTheDocument();
      expect(screen.getByText("build.md")).toBeInTheDocument();
      expect(
        screen.getByText((content, element) =>
          content.includes("# Build Command"),
        ),
      ).toBeInTheDocument();
      expect(
        screen.getByText("Local Settings (settings.local.json)"),
      ).toBeInTheDocument();
    });
  });

  it("shows message for projects without .claude directory", async () => {
    const mockDirectories = [
      {
        project_path: "/Users/developer/projects/api-server",
        claude_dir_path: "/Users/developer/projects/api-server/.claude",
        exists: false,
      },
    ];

    mockApi.getProjectClaudeDirectories.mockResolvedValue(mockDirectories);

    render(<ProjectClaudeDirectories />);

    await waitFor(() => {
      expect(
        screen.getByText("/Users/developer/projects/api-server"),
      ).toBeInTheDocument();
    });

    // Click to expand
    const projectHeader = screen
      .getByText("/Users/developer/projects/api-server")
      .closest("div");
    if (projectHeader?.parentElement) {
      fireEvent.click(projectHeader.parentElement);
    }

    await waitFor(() => {
      expect(
        screen.getByText("This project does not have a .claude directory."),
      ).toBeInTheDocument();
    });
  });

  it("handles refresh functionality", async () => {
    mockApi.getProjectClaudeDirectories.mockResolvedValue([]);

    render(<ProjectClaudeDirectories />);

    await waitFor(() => {
      expect(
        screen.getByText("No projects found with session data."),
      ).toBeInTheDocument();
    });

    // Reset mock to return data on refresh
    const mockDirectories = [
      {
        project_path: "/Users/developer/projects/web-app",
        claude_dir_path: "/Users/developer/projects/web-app/.claude",
        exists: true,
      },
    ];
    mockApi.getProjectClaudeDirectories.mockResolvedValue(mockDirectories);

    // Click refresh button
    const refreshButton = screen.getByText("Refresh");
    fireEvent.click(refreshButton);

    await waitFor(() => {
      expect(
        screen.getByText("/Users/developer/projects/web-app"),
      ).toBeInTheDocument();
    });

    // Verify API was called twice (initial load + refresh)
    expect(mockApi.getProjectClaudeDirectories).toHaveBeenCalledTimes(2);
  });
});
