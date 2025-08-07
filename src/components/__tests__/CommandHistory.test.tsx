import React from "react";
import { render, screen, fireEvent, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { vi } from "vitest";
import { CommandHistory } from "../CommandHistory";
import { api } from "../../api";
import type { CommandLogEntry } from "../../types";

// Mock the API
vi.mock("../../api", () => ({
  api: {
    getCommandHistory: vi.fn(),
    searchCommands: vi.fn(),
  },
}));

// Mock the useDebounce hook
vi.mock("../../hooks/useDebounce", () => ({
  useDebounce: vi.fn((callback) => callback),
}));

const mockCommands: CommandLogEntry[] = [
  {
    timestamp: "2024-01-01T10:00:00Z",
    user: "testuser",
    command: "ls -la",
    cwd: "/home/user",
  },
  {
    timestamp: "2024-01-01T10:01:00Z",
    user: "testuser",
    command:
      "npm install react react-dom @types/react @types/react-dom typescript vite",
    cwd: "/home/user/project",
  },
];

describe("CommandHistory", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    (api.getCommandHistory as any).mockResolvedValue(mockCommands);
    (api.searchCommands as any).mockResolvedValue(mockCommands);
  });

  it("renders command history with commands", async () => {
    render(<CommandHistory />);

    await waitFor(() => {
      expect(screen.getByText("Command History")).toBeInTheDocument();
      expect(screen.getByText("ls -la")).toBeInTheDocument();
    });
  });

  it("shows loading state initially", () => {
    render(<CommandHistory />);
    expect(screen.getByText("Loading command history...")).toBeInTheDocument();
  });

  it("handles search functionality", async () => {
    const user = userEvent.setup();
    render(<CommandHistory />);

    await waitFor(() => {
      expect(screen.getByText("ls -la")).toBeInTheDocument();
    });

    const searchInput = screen.getByPlaceholderText("Search commands...");
    await user.type(searchInput, "npm");

    expect(api.searchCommands).toHaveBeenCalledWith("npm");
  });

  it("expands long commands when expand button is clicked", async () => {
    const user = userEvent.setup();
    render(<CommandHistory />);

    await waitFor(() => {
      expect(screen.getByText(/npm install react/)).toBeInTheDocument();
    });

    const expandButton = screen.getByTitle("Expand command");
    await user.click(expandButton);

    expect(
      screen.getByText(
        /npm install react react-dom @types\/react @types\/react-dom typescript vite/,
      ),
    ).toBeInTheDocument();
  });

  it("copies command to clipboard when copy button is clicked", async () => {
    const user = userEvent.setup();
    const mockClipboard = {
      writeText: vi.fn().mockResolvedValue(undefined),
    };
    Object.assign(navigator, { clipboard: mockClipboard });

    render(<CommandHistory />);

    await waitFor(() => {
      expect(screen.getByText("ls -la")).toBeInTheDocument();
    });

    const copyButtons = screen.getAllByTitle("Copy command to clipboard");
    await user.click(copyButtons[0]);

    expect(mockClipboard.writeText).toHaveBeenCalledWith("ls -la");
    expect(screen.getByText("✓")).toBeInTheDocument();
  });

  it("handles keyboard navigation", async () => {
    const user = userEvent.setup();
    render(<CommandHistory />);

    await waitFor(() => {
      expect(screen.getByText("ls -la")).toBeInTheDocument();
    });

    const commandItems = screen.getAllByRole("listitem");
    const firstItem = commandItems[0];

    firstItem.focus();
    await user.keyboard("{Enter}");

    // Should expand if it's a long command or trigger some interaction
    expect(firstItem).toHaveFocus();
  });

  it("handles export functionality", async () => {
    const user = userEvent.setup();

    // Mock URL.createObjectURL and document.createElement
    const mockCreateObjectURL = vi.fn().mockReturnValue("blob:mock-url");
    const mockRevokeObjectURL = vi.fn();
    Object.assign(URL, {
      createObjectURL: mockCreateObjectURL,
      revokeObjectURL: mockRevokeObjectURL,
    });

    const mockAnchor = {
      href: "",
      download: "",
      click: vi.fn(),
    };
    vi.spyOn(document, "createElement").mockReturnValue(mockAnchor as any);
    vi.spyOn(document.body, "appendChild").mockImplementation(
      () => mockAnchor as any,
    );
    vi.spyOn(document.body, "removeChild").mockImplementation(
      () => mockAnchor as any,
    );

    render(<CommandHistory />);

    await waitFor(() => {
      expect(screen.getByText("ls -la")).toBeInTheDocument();
    });

    const exportButton = screen.getByText("Export All");
    await user.click(exportButton);

    expect(mockCreateObjectURL).toHaveBeenCalled();
    expect(mockAnchor.click).toHaveBeenCalled();
    expect(mockRevokeObjectURL).toHaveBeenCalled();
  });

  it("displays error state when API fails", async () => {
    (api.getCommandHistory as any).mockRejectedValue(new Error("API Error"));

    render(<CommandHistory />);

    await waitFor(() => {
      expect(screen.getByText("Error")).toBeInTheDocument();
      expect(screen.getByText("API Error")).toBeInTheDocument();
    });
  });

  it("shows no commands message when list is empty", async () => {
    (api.getCommandHistory as any).mockResolvedValue([]);

    render(<CommandHistory />);

    await waitFor(() => {
      expect(screen.getByText("No commands found")).toBeInTheDocument();
    });
  });

  it("has proper accessibility attributes", async () => {
    render(<CommandHistory />);

    await waitFor(() => {
      expect(screen.getByText("ls -la")).toBeInTheDocument();
    });

    expect(screen.getByRole("log")).toBeInTheDocument();
    expect(screen.getByLabelText("Search commands")).toBeInTheDocument();

    const commandItems = screen.getAllByRole("listitem");
    expect(commandItems.length).toBeGreaterThan(0);

    commandItems.forEach((item) => {
      expect(item).toHaveAttribute("tabIndex", "0");
    });
  });
});
