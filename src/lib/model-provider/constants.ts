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
    models: ["deepseek-v4-flash", "deepseek-v4-pro"],
    defaultApiKeyEnvVar: "DEEPSEEK_API_KEY",
  },
  glm: {
    id: "glm",
    baseUrl: "https://open.bigmodel.cn/api/paas/v4",
    models: ["glm-5", "glm-4.7", "glm-4.7-flash", "glm-4.5-air"],
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
