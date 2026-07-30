import { describe, expect, it } from "vitest";

import {
  createDefaultCustomProviderSettings,
  createDefaultProviderSettings,
  DEFAULT_MODEL_PROVIDER_SETTINGS,
  PRESET_PROVIDERS,
} from "./constants";
import { resolveProviderConfig } from "./resolve-provider-config";
import type { ModelProviderSettings } from "./types";

function baseSettings(): ModelProviderSettings {
  return {
    enabledProviders: ["deepseek", "glm", "agnes", "nvidia", "minimax"],
    providers: DEFAULT_MODEL_PROVIDER_SETTINGS.providers,
    customProviders: {},
  };
}

describe("resolveProviderConfig", () => {
  it("resolves preset provider configuration", () => {
    expect(
      resolveProviderConfig(
        {
          ...baseSettings(),
          providers: {
            ...DEFAULT_MODEL_PROVIDER_SETTINGS.providers,
            deepseek: {
              ...createDefaultProviderSettings("deepseek"),
              apiKeyEnvVar: "DEEPSEEK_API_KEY",
            },
          },
        },
        "deepseek"
      )
    ).toEqual({
      provider: "deepseek",
      baseUrl: PRESET_PROVIDERS.deepseek.baseUrl,
      apiKeySource: "env",
      apiKey: "",
      apiKeyEnvVar: "DEEPSEEK_API_KEY",
      models: PRESET_PROVIDERS.deepseek.models,
    });
  });

  it("resolves nvidia provider with user-managed models", () => {
    const customModels = [
      {
        id: "meta/llama-3.1-8b-instruct",
        contextWindow: 128_000,
        supportsThinking: false,
        supportsMultimodal: false,
      },
    ];

    expect(
      resolveProviderConfig(
        {
          ...baseSettings(),
          providers: {
            ...DEFAULT_MODEL_PROVIDER_SETTINGS.providers,
            nvidia: {
              ...createDefaultProviderSettings("nvidia"),
              customModels,
            },
          },
        },
        "nvidia"
      )
    ).toEqual({
      provider: "nvidia",
      baseUrl: PRESET_PROVIDERS.nvidia.baseUrl,
      apiKeySource: "env",
      apiKey: "",
      apiKeyEnvVar: "NVIDIA_API_KEY",
      models: customModels,
    });
  });

  it("resolves a custom provider configuration", () => {
    const customModels = [
      {
        id: "custom-model",
        contextWindow: 128_000,
        supportsThinking: false,
        supportsMultimodal: true,
      },
    ];

    expect(
      resolveProviderConfig(
        {
          ...baseSettings(),
          customProviders: {
            "custom-1": {
              ...createDefaultCustomProviderSettings("custom-1", "My Ollama"),
              apiKeySource: "manual",
              apiKey: "sk-custom",
              apiKeyEnvVar: "",
              baseUrl: "https://example.com/v1",
              models: customModels,
            },
          },
        },
        "custom-1"
      )
    ).toEqual({
      provider: "custom-1",
      baseUrl: "https://example.com/v1",
      apiKeySource: "manual",
      apiKey: "sk-custom",
      apiKeyEnvVar: "",
      models: customModels,
    });
  });

  it("returns an empty config for an unknown custom provider id", () => {
    expect(
      resolveProviderConfig(baseSettings(), "custom-missing")
    ).toEqual({
      provider: "custom-missing",
      baseUrl: "",
      apiKeySource: "env",
      apiKey: "",
      apiKeyEnvVar: "",
      models: [],
    });
  });
});
