import { describe, expect, it } from "vitest";

import type { AutomationRecord } from "@/lib/db";
import { createModelDefinition } from "@/lib/model-provider/model-definition";

import { resolveAutomationRunConfig } from "./run-config";

function createAutomation(
  overrides: Partial<AutomationRecord> = {}
): AutomationRecord {
  return {
    id: "auto-1",
    name: "Daily review",
    description: "",
    cronExpression: "0 9 * * *",
    prompt: "Review changes",
    workspaceDir: "/tmp/project",
    model: "custom-model",
    agentMode: "ask",
    thinkingEnabled: true,
    enabled: true,
    runs: [],
    createdAt: 0,
    updatedAt: 0,
    ...overrides,
  };
}

describe("resolveAutomationRunConfig", () => {
  const models = [
    createModelDefinition("default-model", {
      label: "Default",
      supportsThinking: true,
    }),
    createModelDefinition("custom-model", {
      label: "Custom",
      supportsThinking: false,
    }),
  ] as const;

  it("uses stored workspace, mode, and model when valid", () => {
    expect(
      resolveAutomationRunConfig(createAutomation(), { models })
    ).toEqual({
      workspaceDir: "/tmp/project",
      model: "custom-model",
      agentMode: "ask",
      thinkingEnabled: false,
    });
  });

  it("falls back to the provider default model when stored model is missing", () => {
    expect(
      resolveAutomationRunConfig(
        createAutomation({ model: "missing-model" }),
        { models }
      ).model
    ).toBe("default-model");
  });

  it("disables thinking when the selected model does not support it", () => {
    expect(
      resolveAutomationRunConfig(
        createAutomation({
          model: "default-model",
          thinkingEnabled: true,
        }),
        { models }
      ).thinkingEnabled
    ).toBe(true);

    expect(
      resolveAutomationRunConfig(
        createAutomation({
          model: "custom-model",
          thinkingEnabled: true,
        }),
        { models }
      ).thinkingEnabled
    ).toBe(false);
  });
});
