export type ProviderId = "deepseek" | "glm" | "custom";

export type ApiKeySource = "manual" | "env";

export type ModelProviderSettings = {
  provider: ProviderId;
  apiKeySource: ApiKeySource;
  apiKey: string;
  apiKeyEnvVar: string;
  customBaseUrl: string;
  customModels: string[];
};

export type PresetProviderDefinition = {
  id: Exclude<ProviderId, "custom">;
  baseUrl: string;
  models: readonly string[];
  defaultApiKeyEnvVar: string;
};

export type ResolvedProviderConfig = {
  provider: ProviderId;
  baseUrl: string;
  apiKeySource: ApiKeySource;
  apiKey: string;
  apiKeyEnvVar: string;
  models: readonly string[];
};
