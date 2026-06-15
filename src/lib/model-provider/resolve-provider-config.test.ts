import { describe, expect, it } from "vitest";

import {
  createDefaultProviderSettings,
  DEFAULT_MODEL_PROVIDER_SETTINGS,
  PRESET_PROVIDERS,
} from "./constants";
import { resolveProviderConfig } from "./resolve-provider-config";

describe("resolveProviderConfig", () => {
  it("resolves preset provider configuration", () => {
    expect(
      resolveProviderConfig(
        {
          enabledProviders: ["deepseek", "glm", "agnes", "nvidia", "custom"],
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
          enabledProviders: ["deepseek", "glm", "agnes", "nvidia", "custom"],
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

  it("resolves custom provider configuration", () => {
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
          enabledProviders: ["deepseek", "glm", "agnes", "nvidia", "custom"],
          providers: {
            ...DEFAULT_MODEL_PROVIDER_SETTINGS.providers,
            custom: {
              apiKeySource: "manual",
              apiKey: "sk-custom",
              apiKeyEnvVar: "",
              customBaseUrl: "https://example.com/v1",
              customModels,
              showUsage: false,
            },
          },
        },
        "custom"
      )
    ).toEqual({
      provider: "custom",
      baseUrl: "https://example.com/v1",
      apiKeySource: "manual",
      apiKey: "sk-custom",
      apiKeyEnvVar: "",
      models: customModels,
    });
  });
});
