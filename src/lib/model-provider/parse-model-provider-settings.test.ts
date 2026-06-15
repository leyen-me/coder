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
        enabledProviders: ["deepseek", "glm", "agnes", "nvidia", "custom"],
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
      enabledProviders: ["deepseek", "glm", "agnes", "nvidia", "custom"],
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
          showUsage: false,
        },
      },
    });
  });

  it("falls back to defaults for invalid values", () => {
    expect(parseModelProviderSettings(null)).toEqual(
      DEFAULT_MODEL_PROVIDER_SETTINGS
    );
    expect(
      parseModelProviderSettings({ enabledProviders: ["invalid"] })
    ).toEqual({
      ...DEFAULT_MODEL_PROVIDER_SETTINGS,
      enabledProviders: [...PROVIDER_IDS],
    });
  });

  it("filters invalid custom model entries", () => {
    expect(
      parseModelProviderSettings({
        enabledProviders: ["deepseek", "glm", "agnes", "nvidia", "custom"],
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

  it("migrates legacy flat settings into per-provider config with all providers enabled", () => {
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
      enabledProviders: [...PROVIDER_IDS],
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
          showUsage: false,
        },
      },
    });
  });
});
