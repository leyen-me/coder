import { describe, expect, it } from "vitest";

import { DEFAULT_MODEL_PROVIDER_SETTINGS } from "./constants";
import { parseModelProviderSettings } from "./parse-model-provider-settings";
import { parseModelsText } from "./parse-models-text";

describe("parseModelProviderSettings", () => {
  it("accepts valid settings", () => {
    expect(
      parseModelProviderSettings({
        provider: "glm",
        apiKeySource: "manual",
        apiKey: "sk-test",
        apiKeyEnvVar: "GLM_API_KEY",
        customBaseUrl: "https://example.com/v1",
        customModels: ["model-a", "model-b"],
      })
    ).toEqual({
      provider: "glm",
      apiKeySource: "manual",
      apiKey: "sk-test",
      apiKeyEnvVar: "GLM_API_KEY",
      customBaseUrl: "https://example.com/v1",
      customModels: ["model-a", "model-b"],
    });
  });

  it("falls back to defaults for invalid values", () => {
    expect(parseModelProviderSettings(null)).toEqual(
      DEFAULT_MODEL_PROVIDER_SETTINGS
    );
    expect(parseModelProviderSettings({ provider: "invalid" })).toEqual({
      ...DEFAULT_MODEL_PROVIDER_SETTINGS,
      provider: DEFAULT_MODEL_PROVIDER_SETTINGS.provider,
    });
  });

  it("filters invalid custom model entries", () => {
    expect(
      parseModelProviderSettings({
        customModels: ["valid", "", 42, "  trimmed  "],
      }).customModels
    ).toEqual(["valid", "trimmed"]);
  });
});

describe("parseModelsText", () => {
  it("parses one model per line", () => {
    expect(parseModelsText("gpt-4o\n\nclaude-3\n")).toEqual([
      "gpt-4o",
      "claude-3",
    ]);
  });
});
