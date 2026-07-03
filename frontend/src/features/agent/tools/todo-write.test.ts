import { describe, expect, it, vi } from "vitest";

import { TODO_WRITE_TOOL_NAME } from "./definitions";
import { todoWriteHandler } from "./todo-write";
import { toolFailure, toolSuccess } from "./result";

vi.mock("@/lib/db/agent-todos", () => ({
  getAgentTodosBySession: vi.fn(),
  isValidAgentTodoStatus: (status: string) =>
    ["pending", "in_progress", "completed", "cancelled"].includes(status),
  writeAgentTodos: vi.fn(),
}));

import { writeAgentTodos } from "@/lib/db/agent-todos";

const validTodos = [
  { id: "1", content: "Read codebase", status: "completed" as const },
  { id: "2", content: "Implement feature", status: "in_progress" as const },
];

describe("todoWriteHandler", () => {
  it("requires sessionId in context", async () => {
    const result = await todoWriteHandler(
      { merge: true, todos: validTodos },
      { workspaceDir: null }
    );

    expect(result).toEqual(
      toolFailure(
        TODO_WRITE_TOOL_NAME,
        "missing_session",
        "Todo updates require an active chat session."
      )
    );
  });

  it("allows a single-item merge update", async () => {
    vi.mocked(writeAgentTodos).mockResolvedValue([
      {
        id: "2",
        sessionId: "session-1",
        content: "Implement feature",
        status: "in_progress",
        order: 0,
        createdAt: 1,
        updatedAt: 2,
      },
    ]);

    const result = await todoWriteHandler(
      { merge: true, todos: [{ id: "2", status: "in_progress" }] },
      { workspaceDir: null, sessionId: "session-1" }
    );

    expect(writeAgentTodos).toHaveBeenCalledWith("session-1", {
      merge: true,
      todos: [{ id: "2", content: undefined, status: "in_progress" }],
      removeIds: [],
    });
    expect(result.ok).toBe(true);
  });

  it("allows clearing the list with merge=false and empty todos", async () => {
    vi.mocked(writeAgentTodos).mockResolvedValue([]);

    const result = await todoWriteHandler(
      { merge: false, todos: [] },
      { workspaceDir: null, sessionId: "session-1" }
    );

    expect(writeAgentTodos).toHaveBeenCalledWith("session-1", {
      merge: false,
      todos: [],
      removeIds: [],
    });
    expect(result).toEqual(
      toolSuccess(TODO_WRITE_TOOL_NAME, {
        sessionId: "session-1",
        merge: false,
        removed: [],
        todos: [],
        total: 0,
        active: 0,
        completed: 0,
      })
    );
  });

  it("supports remove_ids when merge is true", async () => {
    vi.mocked(writeAgentTodos).mockResolvedValue([
      {
        id: "2",
        sessionId: "session-1",
        content: "Keep me",
        status: "pending",
        order: 0,
        createdAt: 1,
        updatedAt: 2,
      },
    ]);

    const result = await todoWriteHandler(
      { merge: true, todos: [], remove_ids: ["1"] },
      { workspaceDir: null, sessionId: "session-1" }
    );

    expect(writeAgentTodos).toHaveBeenCalledWith("session-1", {
      merge: true,
      todos: [],
      removeIds: ["1"],
    });
    expect(result.ok).toBe(true);
  });

  it("rejects multiple in_progress todos", async () => {
    const result = await todoWriteHandler(
      {
        merge: false,
        todos: [
          { id: "1", content: "Step one", status: "in_progress" },
          { id: "2", content: "Step two", status: "in_progress" },
        ],
      },
      { workspaceDir: null, sessionId: "session-1" }
    );

    expect(result).toEqual(
      toolFailure(
        TODO_WRITE_TOOL_NAME,
        "invalid_arguments",
        "Only one todo can be in_progress at a time"
      )
    );
  });

  it("writes todos for the active session", async () => {
    vi.mocked(writeAgentTodos).mockResolvedValue([
      {
        id: "1",
        sessionId: "session-1",
        content: "Read codebase",
        status: "completed",
        order: 0,
        createdAt: 1,
        updatedAt: 2,
      },
      {
        id: "2",
        sessionId: "session-1",
        content: "Implement feature",
        status: "in_progress",
        order: 1,
        createdAt: 1,
        updatedAt: 2,
      },
    ]);

    const result = await todoWriteHandler(
      { merge: true, todos: validTodos },
      { workspaceDir: null, sessionId: "session-1" }
    );

    expect(writeAgentTodos).toHaveBeenCalledWith("session-1", {
      merge: true,
      todos: validTodos,
      removeIds: [],
    });
    expect(result).toEqual(
      toolSuccess(TODO_WRITE_TOOL_NAME, {
        sessionId: "session-1",
        merge: true,
        removed: [],
        todos: [
          { id: "1", content: "Read codebase", status: "completed" },
          { id: "2", content: "Implement feature", status: "in_progress" },
        ],
        total: 2,
        active: 1,
        completed: 1,
      })
    );
  });
});
