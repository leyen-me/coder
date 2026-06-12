import { describe, expect, it } from "vitest";

import {
  createDefaultProviderSettings,
  DEFAULT_MODEL_PROVIDER_SETTINGS,
  PROVIDER_IDS,
} from "./constants";
import { createModelDefinition } from "./model-definition";
import { parseModelProviderSettings } from "./parse-model-provider-settings";

describe("parseModelProviderSettings", () => {
  it("accepts valid per-provider settings", () => {
    expect(
      parseModelProviderSettings({
        activeProvider: "glm",
        providers: {
          glm: {
            apiKeySource: "manual",
            apiKey: "sk-test",
            apiKeyEnvVar: "GLM_API_KEY",
            customBaseUrl: "https://example.com/v1",
            customModels: [
              createModelDefinition("model-a", { supportsThinking: true }),
              "model-b",
            ],
          },
        },
      })
    ).toEqual({
      activeProvider: "glm",
      providers: {
        ...Object.fromEntries(
          PROVIDER_IDS.filter((id) => id !== "glm").map((id) => [
            id,
            createDefaultProviderSettings(id),
          ])
        ),
        glm: {
          apiKeySource: "manual",
          apiKey: "sk-test",
          apiKeyEnvVar: "GLM_API_KEY",
          customBaseUrl: "https://example.com/v1",
          customModels: [
            createModelDefinition("model-a", { supportsThinking: true }),
            createModelDefinition("model-b"),
          ],
        },
      },
    });
  });

  it("falls back to defaults for invalid values", () => {
    expect(parseModelProviderSettings(null)).toEqual(
      DEFAULT_MODEL_PROVIDER_SETTINGS
    );
    expect(parseModelProviderSettings({ activeProvider: "invalid" })).toEqual({
      ...DEFAULT_MODEL_PROVIDER_SETTINGS,
      activeProvider: DEFAULT_MODEL_PROVIDER_SETTINGS.activeProvider,
    });
  });

  it("filters invalid custom model entries", () => {
    expect(
      parseModelProviderSettings({
        providers: {
          custom: {
            customModels: ["valid", "", 42, "  trimmed  "],
          },
        },
      }).providers.custom.customModels
    ).toEqual([
      createModelDefinition("valid"),
      createModelDefinition("trimmed"),
    ]);
  });

  it("migrates legacy flat settings into the active provider config", () => {
    expect(
      parseModelProviderSettings({
        provider: "glm",
        apiKeySource: "manual",
        apiKey: "sk-legacy",
        apiKeyEnvVar: "GLM_API_KEY",
        customBaseUrl: "https://legacy.example.com/v1",
        customModels: [createModelDefinition("legacy-model")],
      })
    ).toEqual({
      activeProvider: "glm",
      providers: {
        ...Object.fromEntries(
          PROVIDER_IDS.filter((id) => id !== "glm").map((id) => [
            id,
            createDefaultProviderSettings(id),
          ])
        ),
        glm: {
          apiKeySource: "manual",
          apiKey: "sk-legacy",
          apiKeyEnvVar: "GLM_API_KEY",
          customBaseUrl: "https://legacy.example.com/v1",
          customModels: [createModelDefinition("legacy-model")],
        },
      },
    });
  });
});
