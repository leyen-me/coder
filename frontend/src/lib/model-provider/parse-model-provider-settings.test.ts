import { describe, expect, it } from "vitest";

import {
  createDefaultProviderSettings,
  DEFAULT_MODEL_PROVIDER_SETTINGS,
  PROVIDER_IDS,
} from "./constants";
import { createModelDefinition } from "./model-definition";
import { parseModelProviderSettings } from "./parse-model-provider-settings";
import type { ModelProviderSettings } from "./types";

function baseExpected(): ModelProviderSettings {
  return {
    ...DEFAULT_MODEL_PROVIDER_SETTINGS,
    providers: { ...DEFAULT_MODEL_PROVIDER_SETTINGS.providers },
    customProviders: {},
  };
}

describe("parseModelProviderSettings", () => {
  it("accepts valid per-provider settings", () => {
    expect(
      parseModelProviderSettings({
        enabledProviders: ["deepseek", "glm", "agnes", "nvidia", "minimax"],
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
      enabledProviders: ["deepseek", "glm", "agnes", "nvidia", "minimax"],
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
      customProviders: {},
    });
  });

  it("falls back to defaults for invalid values", () => {
    expect(parseModelProviderSettings(null)).toEqual(
      DEFAULT_MODEL_PROVIDER_SETTINGS
    );
    expect(
      parseModelProviderSettings({ enabledProviders: ["invalid"] })
    ).toEqual(baseExpected());
  });

  it("filters invalid custom model entries", () => {
    expect(
      parseModelProviderSettings({
        enabledProviders: ["deepseek"],
        customProviders: {
          "custom-1": {
            id: "custom-1",
            name: "Test",
            apiKeySource: "env",
            apiKey: "",
            apiKeyEnvVar: "OPENAI_API_KEY",
            baseUrl: "",
            models: ["valid", "", 42, "  trimmed  "] as never,
            showUsage: false,
          },
        },
      }).customProviders["custom-1"].models
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
      customProviders: {},
    });
  });

  it("migrates the legacy single custom provider slot into a customProviders entry", () => {
    const parsed = parseModelProviderSettings({
      enabledProviders: ["deepseek", "custom"],
      providers: {
        custom: {
          apiKeySource: "manual",
          apiKey: "sk-custom",
          apiKeyEnvVar: "",
          customBaseUrl: "https://legacy-custom.example.com/v1",
          customModels: [createModelDefinition("legacy-custom-model")],
        },
      },
    });

    expect(parsed.customProviders["custom-legacy"]).toEqual({
      id: "custom-legacy",
      name: "Custom Provider",
      apiKeySource: "manual",
      apiKey: "sk-custom",
      apiKeyEnvVar: "",
      baseUrl: "https://legacy-custom.example.com/v1",
      models: [createModelDefinition("legacy-custom-model")],
      showUsage: false,
    });
    expect(parsed.enabledProviders).toContain("custom-legacy");
    expect(parsed.enabledProviders).not.toContain("custom");
  });
});
