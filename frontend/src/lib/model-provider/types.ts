import type { ModelDefinition } from "./model-definition";

/** Built-in providers with a fixed base URL and preset model list. */
export type ProviderId =
  | "deepseek"
  | "glm"
  | "agnes"
  | "nvidia"
  | "minimax";

/**
 * A custom (user-defined OpenAI-compatible) provider is identified by an
 * arbitrary id such as `custom-<uuid>`. Unlike preset providers, there can be
 * many of them.
 */
export type CustomProviderId = string;

/** Either a built-in provider or a user-defined custom provider. */
export type AnyProviderId = ProviderId | CustomProviderId;

export type ApiKeySource = "manual" | "env";

export type ProviderSettings = {
  apiKeySource: ApiKeySource;
  apiKey: string;
  apiKeyEnvVar: string;
  customBaseUrl: string;
  customModels: ModelDefinition[];
  showUsage: boolean;
};

export type CustomProviderSettings = {
  id: CustomProviderId;
  /** User-facing display name shown in the model picker and settings. */
  name: string;
  apiKeySource: ApiKeySource;
  apiKey: string;
  apiKeyEnvVar: string;
  baseUrl: string;
  models: ModelDefinition[];
  showUsage: boolean;
};

export type ModelProviderSettings = {
  /** Enabled built-in and custom provider ids, in display order. */
  enabledProviders: AnyProviderId[];
  /** Settings for the built-in providers only. */
  providers: Record<ProviderId, ProviderSettings>;
  /** User-defined OpenAI-compatible providers, keyed by id. */
  customProviders: Record<CustomProviderId, CustomProviderSettings>;
};

export type PresetProviderDefinition = {
  id: Exclude<ProviderId, "custom">;
  baseUrl: string;
  models: readonly ModelDefinition[];
  defaultApiKeyEnvVar: string;
};

export type ResolvedProviderConfig = {
  provider: AnyProviderId;
  baseUrl: string;
  apiKeySource: ApiKeySource;
  apiKey: string;
  apiKeyEnvVar: string;
  models: readonly ModelDefinition[];
};

export type { ModelDefinition };
