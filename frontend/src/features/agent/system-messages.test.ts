import { beforeEach, describe, expect, it, vi } from "vitest";

vi.mock("@/lib/db/agent-todos", () => ({
  getAgentTodosBySession: vi.fn(async () => []),
}));

import {
  assembleSystemMessages,
  serializeSystemMessages,
} from "@/features/agent/system-messages";
import { getAgentTodosBySession } from "@/lib/db/agent-todos";
import { normalizeEnvironment } from "@/features/agent/environment/normalize-environment";

const environment = normalizeEnvironment({
  workspaceDir: "/Users/apple/project",
  os: "macos aarch64 (15.5)",
  shell: "/bin/zsh",
  isGitRepository: true,
  today: "2026-06-02, Monday",
});

describe("system message assembly", () => {
  beforeEach(() => {
    vi.mocked(getAgentTodosBySession).mockResolvedValue([]);
  });

  it("assembles runtime system messages in the same order used by the agent", async () => {
    vi.mocked(getAgentTodosBySession).mockResolvedValue([
      {
        id: "task-1",
        sessionId: "session-1",
        content: "Implement prompt refactor",
        status: "in_progress",
        order: 0,
        createdAt: 1,
        updatedAt: 1,
      },
    ]);

    const messages = await assembleSystemMessages({
      environment,
      agentMode: "agent",
      sessionId: "session-1",
      sessionPolicy: {
        sessionKind: "long_task",
        autonomyMode: "unattended",
        decisionPolicyVersion: "mvp-v1",
        decisionModel: "decision-model",
      },
    });

    expect(messages).toHaveLength(3);
    expect(messages.map((message) => message.role)).toEqual([
      "system",
      "system",
      "system",
    ]);
    expect(messages[0]?.content).toContain("## Environment");
    expect(messages[1]?.content).toContain("## Session execution policy");
    expect(messages[2]?.content).toContain("## Current session todo state");
  });

  it("serializes the same assembled system messages for UI preview", async () => {
    vi.mocked(getAgentTodosBySession).mockResolvedValue([
      {
        id: "task-1",
        sessionId: "session-1",
        content: "Implement prompt refactor",
        status: "pending",
        order: 0,
        createdAt: 1,
        updatedAt: 1,
      },
    ]);

    const messages = await assembleSystemMessages({
      environment,
      agentMode: "plan",
      sessionId: "session-1",
      sessionPolicy: {
        sessionKind: "long_task",
        autonomyMode: "unattended",
        decisionPolicyVersion: "mvp-v1",
        decisionModel: "decision-model",
      },
    });

    const preview = serializeSystemMessages(messages);

    expect(preview).toContain("## Environment");
    expect(preview).toContain("## Session execution policy");
    expect(preview).toContain("## Current session todo state");
    expect(preview.indexOf("## Environment")).toBeLessThan(
      preview.indexOf("## Session execution policy")
    );
    expect(preview.indexOf("## Session execution policy")).toBeLessThan(
      preview.indexOf("## Current session todo state")
    );
  });
});
