import { describe, expect, it, vi } from "vitest";

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
