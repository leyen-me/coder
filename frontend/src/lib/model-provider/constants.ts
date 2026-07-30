import { createModelDefinition } from "./model-definition";
import {
  AGNES_THINKING_CONFIG,
  DEEPSEEK_THINKING_CONFIG,
  GLM_THINKING_CONFIG,
  MINIMAX_THINKING_CONFIG,
} from "./thinking-config";
import type {
  CustomProviderSettings,
  ModelProviderSettings,
  PresetProviderDefinition,
  ProviderId,
  ProviderSettings,
} from "./types";

export const MODEL_PROVIDER_STORAGE_KEY = "coder:model-provider-settings";

export const PROVIDER_IDS = [
  "deepseek",
  "glm",
  "agnes",
  "nvidia",
  "minimax",
] as const satisfies readonly ProviderId[];

/** Prefix used for generated custom provider ids (e.g. `custom-<uuid>`). */
export const CUSTOM_PROVIDER_ID_PREFIX = "custom-";

/** Preset providers whose model list is maintained by the user in settings. */
export const USER_MANAGED_MODEL_PROVIDER_IDS = [
  "nvidia",
] as const satisfies readonly ProviderId[];

export function isPresetProvider(provider: string): provider is ProviderId {
  return (PROVIDER_IDS as readonly string[]).includes(provider);
}

export function isCustomProviderId(provider: string): boolean {
  return (
    !isPresetProvider(provider) &&
    provider.startsWith(CUSTOM_PROVIDER_ID_PREFIX)
  );
}

/** Static (non-localized) display labels for the built-in providers. */
export const PRESET_PROVIDER_LABELS: Record<ProviderId, string> = {
  deepseek: "DeepSeek",
  glm: "GLM",
  agnes: "Agnes",
  nvidia: "NVIDIA",
  minimax: "MiniMax",
};

export function usesUserManagedModels(provider: string): boolean {
  return (USER_MANAGED_MODEL_PROVIDER_IDS as readonly string[]).includes(
    provider
  );
}

export const API_KEY_SOURCES = ["manual", "env"] as const;

export const PRESET_PROVIDERS = {
  deepseek: {
    id: "deepseek",
    baseUrl: "https://api.deepseek.com",
    models: [
      createModelDefinition("deepseek-v4-flash", {
        label: "DeepSeek V4 Flash",
        contextWindow: 1_000_000,
        supportsThinking: true,
        supportsMultimodal: false,
        thinkingConfig: DEEPSEEK_THINKING_CONFIG,
      }),
      createModelDefinition("deepseek-v4-pro", {
        label: "DeepSeek V4 Pro",
        contextWindow: 1_000_000,
        supportsThinking: true,
        supportsMultimodal: false,
        thinkingConfig: DEEPSEEK_THINKING_CONFIG,
      }),
    ],
    defaultApiKeyEnvVar: "DEEPSEEK_API_KEY",
  },
  glm: {
    id: "glm",
    baseUrl: "https://open.bigmodel.cn/api/paas/v4",
    models: [
      createModelDefinition("glm-5", {
        label: "GLM-5",
        contextWindow: 200_000,
        supportsThinking: true,
        supportsMultimodal: false,
        thinkingConfig: GLM_THINKING_CONFIG,
      }),
      createModelDefinition("glm-4.7", {
        label: "GLM-4.7",
        contextWindow: 200_000,
        supportsThinking: true,
        supportsMultimodal: false,
        thinkingConfig: GLM_THINKING_CONFIG,
      }),
      createModelDefinition("glm-4.7-flash", {
        label: "GLM-4.7 Flash",
        contextWindow: 200_000,
        supportsThinking: true,
        supportsMultimodal: false,
        thinkingConfig: GLM_THINKING_CONFIG,
      }),
      createModelDefinition("glm-4.5-air", {
        label: "GLM-4.5 Air",
        contextWindow: 128_000,
        supportsThinking: true,
        supportsMultimodal: false,
        thinkingConfig: GLM_THINKING_CONFIG,
      }),
    ],
    defaultApiKeyEnvVar: "GLM_API_KEY",
  },
  agnes: {
    id: "agnes",
    baseUrl: "https://apihub.agnes-ai.com/v1",
    models: [
      createModelDefinition("agnes-2.0-flash", {
        label: "Agnes 2.0 Flash",
        contextWindow: 256_000,
        supportsThinking: true,
        supportsMultimodal: false,
        thinkingConfig: AGNES_THINKING_CONFIG,
      }),
      createModelDefinition("agnes-1.5-flash", {
        label: "Agnes 1.5 Flash",
        contextWindow: 256_000,
        supportsThinking: true,
        supportsMultimodal: false,
        thinkingConfig: AGNES_THINKING_CONFIG,
      }),
    ],
    defaultApiKeyEnvVar: "AGNES_API_KEY",
  },
  nvidia: {
    id: "nvidia",
    baseUrl: "https://integrate.api.nvidia.com/v1",
    models: [],
    defaultApiKeyEnvVar: "NVIDIA_API_KEY",
  },
  minimax: {
    id: "minimax",
    baseUrl: "https://api.minimaxi.com/v1",
    models: [
      createModelDefinition("MiniMax-M3", {
        label: "MiniMax-M3",
        contextWindow: 1_000_000,
        supportsThinking: true,
        supportsMultimodal: true,
        thinkingConfig: MINIMAX_THINKING_CONFIG,
      }),
      createModelDefinition("MiniMax-M2.7", {
        label: "MiniMax-M2.7",
        contextWindow: 204_800,
        supportsThinking: false,
        supportsMultimodal: false,
      }),
    ],
    defaultApiKeyEnvVar: "MINIMAX_API_KEY",
  },
} as const satisfies Record<
  Exclude<ProviderId, "custom">,
  PresetProviderDefinition
>;

export function getDefaultApiKeyEnvVar(provider: string): string {
  if (isPresetProvider(provider)) {
    return PRESET_PROVIDERS[provider].defaultApiKeyEnvVar;
  }

  return "OPENAI_API_KEY";
}

export function createDefaultProviderSettings(
  provider: ProviderId
): ProviderSettings {
  return {
    apiKeySource: "env",
    apiKey: "",
    apiKeyEnvVar: getDefaultApiKeyEnvVar(provider),
    customBaseUrl: "",
    customModels: [],
    showUsage: false,
  };
}

export function createDefaultCustomProviderSettings(
  id: string,
  name = "Custom Provider"
): CustomProviderSettings {
  return {
    id,
    name,
    apiKeySource: "env",
    apiKey: "",
    apiKeyEnvVar: "OPENAI_API_KEY",
    baseUrl: "",
    models: [],
    showUsage: false,
  };
}

export const DEFAULT_MODEL_PROVIDER_SETTINGS: ModelProviderSettings = {
  enabledProviders: [...PROVIDER_IDS],
  providers: Object.fromEntries(
    PROVIDER_IDS.map((id) => [id, createDefaultProviderSettings(id)])
  ) as Record<ProviderId, ProviderSettings>,
  customProviders: {},
};
