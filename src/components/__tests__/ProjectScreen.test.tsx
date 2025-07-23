import { describe, it, expect, vi, beforeEach } from "vitest";
import { render, screen, fireEvent, waitFor } from "@testing-library/react";
import { ProjectScreen } from "../ProjectScreen";
import { api } from "../../api";

vi.mock("../../api");
const mockApi = vi.mocked(api);

const mockProjectSummary = {
  project_path: "-Users-john-documents-test-project",
  session_count: 3,
  last_activity: "2024-01-15T10:00:00Z",
  total_messages: 25,
  active_todos: 2,
};

const mockSessions = [
  {
    session_id: "session-123",
    project_path: "-Users-john-documents-test-project",
    created_at: "2024-01-15T09:00:00Z",
    updated_at: "2024-01-15T10:00:00Z",
    message_count: 10,
    git_branch: "main",
    latest_content_preview: "Test preview content",
    is_processing: false,
  },
  {
    session_id: "session-456",
    project_path: "-Users-john-documents-test-project",
    created_at: "2024-01-14T09:00:00Z",
    updated_at: "2024-01-14T11:00:00Z",
    message_count: 15,
    git_branch: "feature/test",
    latest_content_preview: "Another preview",
    is_processing: true,
  },
];

const mockMessages = [
  {
    uuid: "msg-1",
    session_id: "session-123",
    timestamp: "2024-01-15T09:30:00Z",
    message_type: "user" as const,
    content: { role: "user", content: "Hello, Claude!" },
    cwd: "/Users/john/documents/test-project",
    processing_status: "completed" as const,
  },
  {
    uuid: "msg-2",
    session_id: "session-123",
    timestamp: "2024-01-15T09:31:00Z",
    message_type: "assistant" as const,
    content: {
      role: "assistant",
      content: [{ type: "text" as const, text: "Hello! How can I help?" }],
    },
    cwd: "/Users/john/documents/test-project",
    processing_status: "completed" as const,
  },
];

describe("ProjectScreen", () => {
  const mockOnBack = vi.fn();

  beforeEach(() => {
    vi.clearAllMocks();
    mockApi.getAllSessions.mockResolvedValue(mockSessions);
    mockApi.getProjectSummary.mockResolvedValue([mockProjectSummary]);
    mockApi.getSessionMessages.mockResolvedValue(mockMessages);
  });

  it("should render project information correctly", async () => {
    render(
      <ProjectScreen
        projectPath="-Users-john-documents-test-project"
        onBack={mockOnBack}
      />,
    );

    await waitFor(() => {
      expect(screen.getByText("project")).toBeInTheDocument();
    });

    expect(
      screen.getByText("/Users/john/documents/test/project"),
    ).toBeInTheDocument();
    expect(screen.getByText("3 sessions")).toBeInTheDocument();
    expect(screen.getByText("25 messages")).toBeInTheDocument();
    expect(screen.getByText("2 TODOs")).toBeInTheDocument();
  });

  it("should display .claude directory information when tab is clicked", async () => {
    render(
      <ProjectScreen
        projectPath="-Users-john-documents-test-project"
        onBack={mockOnBack}
      />,
    );

    await waitFor(() => {
      expect(screen.getByText(".claude Directory")).toBeInTheDocument();
    });

    // Click on .claude Directory tab
    fireEvent.click(screen.getByText(".claude Directory"));

    await waitFor(() => {
      expect(screen.getByText("Directory Information")).toBeInTheDocument();
    });

    expect(
      screen.getByText("/Users/john/documents/test/project/.claude"),
    ).toBeInTheDocument();
    expect(screen.getByText("Yes")).toBeInTheDocument();
  });

  it("should render sessions list", async () => {
    render(
      <ProjectScreen
        projectPath="-Users-john-documents-test-project"
        onBack={mockOnBack}
      />,
    );

    await waitFor(() => {
      expect(
        screen.getByRole("button", { name: /Sessions \(2\)/ }),
      ).toBeInTheDocument();
    });

    expect(screen.getAllByText(/Session session-.../)).toHaveLength(2);
    expect(screen.getByText("Test preview content")).toBeInTheDocument();
    expect(screen.getByText("Another preview")).toBeInTheDocument();
  });

  it("should load messages when session is selected", async () => {
    render(
      <ProjectScreen
        projectPath="-Users-john-documents-test-project"
        onBack={mockOnBack}
      />,
    );

    await waitFor(() => {
      expect(
        screen.getByRole("button", { name: /Sessions \(2\)/ }),
      ).toBeInTheDocument();
    });

    const sessionItems = screen.getAllByText(/Session session-.../);
    const sessionItem = sessionItems[0];
    fireEvent.click(sessionItem);

    await waitFor(() => {
      expect(mockApi.getSessionMessages).toHaveBeenCalledWith("session-123");
    });

    await waitFor(() => {
      expect(
        screen.getByText(/Messages for Session session-.../),
      ).toBeInTheDocument();
    });
  });

  it("should call onBack when back button is clicked", async () => {
    render(
      <ProjectScreen
        projectPath="-Users-john-documents-test-project"
        onBack={mockOnBack}
      />,
    );

    await waitFor(() => {
      expect(screen.getByText("← Back to Dashboard")).toBeInTheDocument();
    });

    fireEvent.click(screen.getByText("← Back to Dashboard"));
    expect(mockOnBack).toHaveBeenCalled();
  });

  it("should handle loading and error states", async () => {
    render(
      <ProjectScreen
        projectPath="-Users-john-documents-test-project"
        onBack={mockOnBack}
      />,
    );

    expect(screen.getByText("Loading project...")).toBeInTheDocument();

    await waitFor(() => {
      expect(screen.queryByText("Loading project...")).not.toBeInTheDocument();
    });
  });

  it("should handle error state", async () => {
    mockApi.getAllSessions.mockRejectedValue(
      new Error("Failed to load sessions"),
    );

    render(
      <ProjectScreen
        projectPath="-Users-john-documents-test-project"
        onBack={mockOnBack}
      />,
    );

    await waitFor(() => {
      expect(screen.getByText("Error loading project")).toBeInTheDocument();
    });

    expect(screen.getByText("Failed to load sessions")).toBeInTheDocument();
  });
});
