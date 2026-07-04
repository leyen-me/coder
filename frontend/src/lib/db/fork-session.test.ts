import { describe, expect, it, vi } from "vitest";

vi.mock("./messages", () => ({
  createMessage: vi.fn(),
  createMessageId: vi.fn(() => "msg-new"),
  getMessagesBySession: vi.fn(),
}));

vi.mock("./sessions", () => ({
  createSession: vi.fn(),
  getSession: vi.fn(),
}));

vi.mock("./subscriptions", () => ({
  notifyDbChange: vi.fn(),
}));

import { createSession, getSession } from "./sessions";
import { getMessagesBySession } from "./messages";
import { forkSessionFromMessage } from "./fork-session";

describe("forkSessionFromMessage", () => {
  it("copies plan binding fields into the forked session", async () => {
    vi.mocked(getSession).mockResolvedValue({
      id: "source-session",
      title: "Plan chat",
      model: "gpt-test",
      provider: "custom",
      workspaceDir: "/workspace",
      sessionKind: "standard",
      autonomyMode: "interactive",
      decisionPolicyVersion: "mvp-v1",
      planFileName: "auth-plan.md",
      planBuiltAt: 123,
      enableEmail: true,
      createdAt: 1,
      updatedAt: 1,
    });
    vi.mocked(getMessagesBySession).mockResolvedValue([
      {
        id: "msg-1",
        sessionId: "source-session",
        role: "user",
        content: "hello",
        thinking: "",
        toolInvocations: [],
        status: "completed",
        taskId: null,
        error: null,
        createdAt: 1,
      },
    ]);
    vi.mocked(createSession).mockResolvedValue({
      id: "fork-session",
      title: "Fork",
      model: "gpt-test",
      provider: "custom",
      workspaceDir: "/workspace",
      sessionKind: "standard",
      autonomyMode: "interactive",
      decisionPolicyVersion: "mvp-v1",
      createdAt: 2,
      updatedAt: 2,
    });

    await forkSessionFromMessage("source-session", "msg-1", "Fork");

    expect(createSession).toHaveBeenCalledWith(
      expect.objectContaining({
        planFileName: "auth-plan.md",
        planBuiltAt: 123,
        enableEmail: true,
      }),
    );
  });
});
