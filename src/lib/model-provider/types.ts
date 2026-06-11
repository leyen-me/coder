import type { ModelDefinition } from "./model-definition";

export type ProviderId = "deepseek" | "glm" | "agnes" | "custom";

export type ApiKeySource = "manual" | "env";

export type ModelProviderSettings = {
  provider: ProviderId;
  apiKeySource: ApiKeySource;
  apiKey: string;
  apiKeyEnvVar: string;
  customBaseUrl: string;
  customModels: ModelDefinition[];
};

export type PresetProviderDefinition = {
  id: Exclude<ProviderId, "custom">;
  baseUrl: string;
  models: readonly ModelDefinition[];
  defaultApiKeyEnvVar: string;
};

export type ResolvedProviderConfig = {
  provider: ProviderId;
  baseUrl: string;
  apiKeySource: ApiKeySource;
  apiKey: string;
  apiKeyEnvVar: string;
  models: readonly ModelDefinition[];
};

export type { ModelDefinition };
