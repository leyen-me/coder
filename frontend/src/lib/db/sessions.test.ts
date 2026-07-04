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
import { deleteSession } from "./sessions";

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
