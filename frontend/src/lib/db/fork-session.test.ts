import { beforeEach, describe, expect, it, vi } from "vitest";

let nextMessageId = 0;

vi.mock("./messages", () => ({
  createMessage: vi.fn(),
  createMessageId: vi.fn(() => {
    nextMessageId += 1;
    return `msg-new-${nextMessageId}`;
  }),
  getMessagesBySession: vi.fn(),
}));

vi.mock("./sessions", () => ({
  createSession: vi.fn(),
  getSession: vi.fn(),
}));

vi.mock("./subscriptions", () => ({
  notifyDbChange: vi.fn(),
}));

vi.mock("./agent-todos", () => ({
  copyAgentTodosForSession: vi.fn(),
}));

import { copyAgentTodosForSession } from "./agent-todos";
import { createMessage, getMessagesBySession } from "./messages";
import { createSession, getSession } from "./sessions";
import { forkSessionFromMessage } from "./fork-session";

describe("forkSessionFromMessage", () => {
  beforeEach(() => {
    nextMessageId = 0;
    vi.clearAllMocks();
  });

  it("copies message metadata into forked messages", async () => {
    vi.mocked(getSession).mockResolvedValue({
      id: "source-session",
      title: "Chat",
      model: "gpt-test",
      provider: "custom",
      workspaceDir: null,
      sessionKind: "standard",
      autonomyMode: "interactive",
      decisionPolicyVersion: "mvp-v1",
      createdAt: 1,
      updatedAt: 1,
    });
    vi.mocked(getMessagesBySession).mockResolvedValue([
      {
        id: "msg-1",
        sessionId: "source-session",
        role: "assistant",
        content: "done",
        referencedSkills: ["review"],
        thinking: "hmm",
        toolInvocations: [],
        status: "completed",
        taskId: "task-1",
        error: null,
        durationMs: 1200,
        usage: {
          promptTokens: 10,
          completionTokens: 5,
          totalTokens: 15,
        },
        createdAt: 1,
      },
    ]);
    vi.mocked(createSession).mockResolvedValue({
      id: "fork-session",
      title: "Fork",
      model: "gpt-test",
      provider: "custom",
      workspaceDir: null,
      sessionKind: "standard",
      autonomyMode: "interactive",
      decisionPolicyVersion: "mvp-v1",
      createdAt: 2,
      updatedAt: 2,
    });

    await forkSessionFromMessage("source-session", "msg-1", "Fork");

    expect(createMessage).toHaveBeenCalledWith(
      expect.objectContaining({
        referencedSkills: ["review"],
        durationMs: 1200,
        usage: {
          promptTokens: 10,
          completionTokens: 5,
          totalTokens: 15,
        },
        taskId: null,
      }),
    );
  });

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
      }),
    );
  });

  it("copies agent todos into the forked session", async () => {
    vi.mocked(getSession).mockResolvedValue({
      id: "source-session",
      title: "Chat",
      model: "gpt-test",
      provider: "custom",
      workspaceDir: null,
      sessionKind: "standard",
      autonomyMode: "interactive",
      decisionPolicyVersion: "mvp-v1",
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
      workspaceDir: null,
      sessionKind: "standard",
      autonomyMode: "interactive",
      decisionPolicyVersion: "mvp-v1",
      createdAt: 2,
      updatedAt: 2,
    });

    await forkSessionFromMessage("source-session", "msg-1", "Fork");

    expect(copyAgentTodosForSession).toHaveBeenCalledWith(
      "source-session",
      "fork-session"
    );
  });

  it("remaps compact first_kept taskId onto forked message ids", async () => {
    vi.mocked(getSession).mockResolvedValue({
      id: "source-session",
      title: "Chat",
      model: "gpt-test",
      provider: "custom",
      workspaceDir: null,
      sessionKind: "standard",
      autonomyMode: "interactive",
      decisionPolicyVersion: "mvp-v1",
      createdAt: 1,
      updatedAt: 1,
    });
    vi.mocked(getMessagesBySession).mockResolvedValue([
      {
        id: "kept-old",
        sessionId: "source-session",
        role: "user",
        content: "kept",
        thinking: "",
        toolInvocations: [],
        status: "completed",
        taskId: null,
        error: null,
        createdAt: 1,
      },
      {
        id: "tail-old",
        sessionId: "source-session",
        role: "assistant",
        content: "tail",
        thinking: "",
        toolInvocations: [],
        status: "completed",
        taskId: "agent-task",
        error: null,
        createdAt: 2,
      },
      {
        id: "compact-old",
        sessionId: "source-session",
        role: "assistant",
        messageKind: "compact",
        content: "summary",
        thinking: "",
        toolInvocations: [],
        status: "completed",
        taskId: "kept-old",
        error: null,
        createdAt: 3,
      },
    ]);
    vi.mocked(createSession).mockResolvedValue({
      id: "fork-session",
      title: "Fork",
      model: "gpt-test",
      provider: "custom",
      workspaceDir: null,
      sessionKind: "standard",
      autonomyMode: "interactive",
      decisionPolicyVersion: "mvp-v1",
      createdAt: 2,
      updatedAt: 2,
    });

    await forkSessionFromMessage("source-session", "compact-old", "Fork");

    const createCalls = vi.mocked(createMessage).mock.calls.map(
      ([payload]) => payload
    );
    const forkedKept = createCalls.find((payload) => payload.content === "kept");
    const forkedCompact = createCalls.find(
      (payload) => payload.messageKind === "compact"
    );
    const forkedTail = createCalls.find((payload) => payload.content === "tail");

    expect(forkedKept?.id).toBeTruthy();
    expect(forkedCompact?.taskId).toBe(forkedKept?.id);
    expect(forkedTail?.taskId).toBeNull();
  });
});
