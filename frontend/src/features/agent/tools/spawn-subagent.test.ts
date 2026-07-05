import { beforeEach, describe, expect, it, vi } from "vitest";

vi.mock("../agent-loop", () => ({
  runAgentWithTools: vi.fn(),
}));

vi.mock("../runner", () => ({
  cancelAgent: vi.fn(),
}));

import { runAgentWithTools } from "../agent-loop";
import { SPAWN_SUBAGENT_TOOL_NAME } from "./definitions";
import { spawnSubAgentHandler } from "./spawn-subagent";
import { toolFailure } from "./result";

const providerConfig = {
  baseUrl: "https://api.example.com/v1",
  apiKey: "test-key",
  apiKeySource: "manual" as const,
  apiKeyEnvVar: "",
  model: "test-model",
  models: [],
  thinkingEnabled: false,
};

describe("spawnSubAgentHandler", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("builds a structured system prompt for the delegated sub-agent", async () => {
    vi.mocked(runAgentWithTools).mockResolvedValue(undefined);

    await spawnSubAgentHandler(
      {
        task: "Investigate failing tests",
        context: "Focus on the agent prompt pipeline.",
        tools: ["read_file", "grep"],
      },
      {
        workspaceDir: "/workspace",
        sessionId: "session-1",
        taskId: "task-1",
        spawnSubAgentConfig: providerConfig,
      },
    );

    const firstCall = vi.mocked(runAgentWithTools).mock.calls[0];
    const startInput = firstCall?.[0];
    const systemMessage = startInput?.messages[0];

    expect(systemMessage?.role).toBe("system");
    expect(systemMessage?.content).toContain("focused sub-agent");
    expect(systemMessage?.content).toContain("## Communication Rules");
    expect(systemMessage?.content).toContain("## Delegated Task");
    expect(systemMessage?.content).toContain("Investigate failing tests");
    expect(systemMessage?.content).toContain("## Additional Context");
    expect(systemMessage?.content).toContain("Focus on the agent prompt pipeline.");
    expect(systemMessage?.content).toContain("## Allowed Tools");
    expect(systemMessage?.content).toContain("read_file, grep");
  });

  it("returns toolFailure when the sub-agent run throws", async () => {
    vi.mocked(runAgentWithTools).mockRejectedValue(new Error("network down"));

    const result = await spawnSubAgentHandler(
      { task: "Investigate failing tests" },
      {
        workspaceDir: "/workspace",
        sessionId: "session-1",
        taskId: "task-1",
        spawnSubAgentConfig: providerConfig,
      },
    );

    expect(result).toEqual(
      toolFailure(SPAWN_SUBAGENT_TOOL_NAME, "subagent_failed", "network down"),
    );
  });
});
