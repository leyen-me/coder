import { describe, expect, it } from "vitest";

import { createModelDefinition } from "./model-definition";
import { DEFAULT_MODEL_PROVIDER_SETTINGS } from "./constants";
import { parseModelProviderSettings } from "./parse-model-provider-settings";

describe("parseModelProviderSettings", () => {
  it("accepts valid settings", () => {
    expect(
      parseModelProviderSettings({
        provider: "glm",
        apiKeySource: "manual",
        apiKey: "sk-test",
        apiKeyEnvVar: "GLM_API_KEY",
        customBaseUrl: "https://example.com/v1",
        customModels: [
          createModelDefinition("model-a", { supportsThinking: true }),
          "model-b",
        ],
      })
    ).toEqual({
      provider: "glm",
      apiKeySource: "manual",
      apiKey: "sk-test",
      apiKeyEnvVar: "GLM_API_KEY",
      customBaseUrl: "https://example.com/v1",
      customModels: [
        createModelDefinition("model-a", { supportsThinking: true }),
        createModelDefinition("model-b"),
      ],
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
    ).toEqual([
      createModelDefinition("valid"),
      createModelDefinition("trimmed"),
    ]);
  });
});
