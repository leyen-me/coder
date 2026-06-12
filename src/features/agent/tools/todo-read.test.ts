import { describe, expect, it, vi } from "vitest";

import { TODO_READ_TOOL_NAME } from "./definitions";
import { todoReadHandler } from "./todo-read";
import { toolFailure, toolSuccess } from "./result";

vi.mock("@/lib/db/agent-todos", () => ({
  getAgentTodosBySession: vi.fn(),
}));

import { getAgentTodosBySession } from "@/lib/db/agent-todos";

describe("todoReadHandler", () => {
  it("requires sessionId in context", async () => {
    const result = await todoReadHandler({}, { workspaceDir: null });

    expect(result).toEqual(
      toolFailure(
        TODO_READ_TOOL_NAME,
        "missing_session",
        "Todo reads require an active chat session."
      )
    );
  });

  it("rejects unexpected arguments", async () => {
    const result = await todoReadHandler(
      { unexpected: true },
      { workspaceDir: null, sessionId: "session-1" }
    );

    expect(result).toEqual(
      toolFailure(
        TODO_READ_TOOL_NAME,
        "invalid_arguments",
        "todo_read does not accept any arguments"
      )
    );
  });

  it("reads todos for the active session", async () => {
    vi.mocked(getAgentTodosBySession).mockResolvedValue([
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

    const result = await todoReadHandler({}, {
      workspaceDir: null,
      sessionId: "session-1",
    });

    expect(getAgentTodosBySession).toHaveBeenCalledWith("session-1");
    expect(result).toEqual(
      toolSuccess(TODO_READ_TOOL_NAME, {
        sessionId: "session-1",
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
