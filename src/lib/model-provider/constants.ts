import { createModelDefinition } from "./model-definition";
import {
  DEEPSEEK_THINKING_CONFIG,
  GLM_THINKING_CONFIG,
} from "./thinking-config";
import type {
  ModelProviderSettings,
  PresetProviderDefinition,
  ProviderId,
} from "./types";

export const MODEL_PROVIDER_STORAGE_KEY = "coder:model-provider-settings";

export const PROVIDER_IDS = ["deepseek", "glm", "custom"] as const satisfies readonly ProviderId[];

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
} as const satisfies Record<
  Exclude<ProviderId, "custom">,
  PresetProviderDefinition
>;

export const DEFAULT_MODEL_PROVIDER_SETTINGS: ModelProviderSettings = {
  provider: "deepseek",
  apiKeySource: "env",
  apiKey: "",
  apiKeyEnvVar: PRESET_PROVIDERS.deepseek.defaultApiKeyEnvVar,
  customBaseUrl: "",
  customModels: [],
};
