import { describe, expect, it } from "vitest";

import {
  applySingleInProgressConstraint,
  mergeAgentTodoInputs,
  normalizeAgentTodoRecord,
} from "./agent-todos";

describe("agent todos helpers", () => {
  it("normalizes invalid status to pending", () => {
    expect(
      normalizeAgentTodoRecord({
        id: "1",
        sessionId: "session-1",
        content: "  Task  ",
        status: "invalid" as never,
        order: 0,
        createdAt: 1,
        updatedAt: 2,
      })
    ).toEqual({
      id: "1",
      sessionId: "session-1",
      content: "Task",
      status: "pending",
      order: 0,
      createdAt: 1,
      updatedAt: 2,
    });
  });

  it("keeps existing content when merge omits content", () => {
    const merged = mergeAgentTodoInputs(
      [
        {
          id: "1",
          sessionId: "session-1",
          content: "Read code",
          status: "pending",
          order: 0,
          createdAt: 1,
          updatedAt: 1,
        },
      ],
      [{ id: "1", status: "completed" }]
    );

    expect(merged).toEqual([
      { id: "1", content: "Read code", status: "completed" },
    ]);
  });

  it("merges incoming todos by id while preserving untouched items", () => {
    const merged = mergeAgentTodoInputs(
      [
        {
          id: "1",
          sessionId: "session-1",
          content: "Read code",
          status: "completed",
          order: 0,
          createdAt: 1,
          updatedAt: 1,
        },
        {
          id: "2",
          sessionId: "session-1",
          content: "Write tests",
          status: "pending",
          order: 1,
          createdAt: 1,
          updatedAt: 1,
        },
      ],
      [{ id: "2", content: "Write tests", status: "in_progress" }]
    );

    expect(merged).toEqual([
      { id: "1", content: "Read code", status: "completed" },
      { id: "2", content: "Write tests", status: "in_progress" },
    ]);
  });

  it("enforces a single in_progress todo", () => {
    const records = applySingleInProgressConstraint([
      {
        id: "1",
        sessionId: "session-1",
        content: "First",
        status: "in_progress",
        order: 0,
        createdAt: 1,
        updatedAt: 1,
      },
      {
        id: "2",
        sessionId: "session-1",
        content: "Second",
        status: "in_progress",
        order: 1,
        createdAt: 1,
        updatedAt: 1,
      },
    ]);

    expect(records.map((todo) => todo.status)).toEqual(["in_progress", "pending"]);
  });
});
