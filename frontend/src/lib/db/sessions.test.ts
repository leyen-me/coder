import { beforeEach, describe, expect, it, vi } from "vitest";

vi.mock("./client", () => ({
  getDb: vi.fn(),
}));

vi.mock("./messages", () => ({
  deleteMessagesBySession: vi.fn(),
}));

vi.mock("./agent-todos", () => ({
  clearAgentTodosBySession: vi.fn(),
}));

vi.mock("./subscriptions", () => ({
  notifyDbChange: vi.fn(),
}));

import { getDb } from "./client";
import { clearAgentTodosBySession } from "./agent-todos";
import { deleteMessagesBySession } from "./messages";
import { deleteSession, createSession } from "./sessions";

describe("createSession", () => {
  beforeEach(() => {
    vi.mocked(getDb).mockResolvedValue({
      put: vi.fn(),
    } as never);
  });

  it("persists planBuiltAt when provided", async () => {
    const db = await getDb();

    const session = await createSession({
      title: "Plan chat",
      model: "gpt-test",
      provider: "custom",
      planFileName: "auth-plan.md",
      planBuiltAt: 123,
    });

    expect(session.planFileName).toBe("auth-plan.md");
    expect(session.planBuiltAt).toBe(123);
    expect(db.put).toHaveBeenCalledWith(
      "sessions",
      expect.objectContaining({
        planFileName: "auth-plan.md",
        planBuiltAt: 123,
      }),
    );
  });
});

describe("deleteSession", () => {
  beforeEach(() => {
    vi.mocked(getDb).mockResolvedValue({
      delete: vi.fn(),
    } as never);
  });

  it("clears agent todos before deleting the session", async () => {
    const db = await getDb();

    await deleteSession("session-1");

    expect(clearAgentTodosBySession).toHaveBeenCalledWith("session-1");
    expect(db.delete).toHaveBeenCalledWith("sessions", "session-1");
    expect(deleteMessagesBySession).toHaveBeenCalledWith("session-1");
  });
});
