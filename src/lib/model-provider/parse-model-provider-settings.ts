import {
  API_KEY_SOURCES,
  DEFAULT_MODEL_PROVIDER_SETTINGS,
  PROVIDER_IDS,
} from "./constants";
import { parseModelDefinitions } from "./model-definition";
import type { ApiKeySource, ModelProviderSettings, ProviderId } from "./types";

function isProviderId(value: unknown): value is ProviderId {
  return (
    typeof value === "string" &&
    (PROVIDER_IDS as readonly string[]).includes(value)
  );
}

function isApiKeySource(value: unknown): value is ApiKeySource {
  return (
    typeof value === "string" &&
    (API_KEY_SOURCES as readonly string[]).includes(value)
  );
}

export function parseModelProviderSettings(
  raw: unknown
): ModelProviderSettings {
  if (raw === null || raw === undefined || typeof raw !== "object") {
    return DEFAULT_MODEL_PROVIDER_SETTINGS;
  }

  const record = raw as Record<string, unknown>;

  return {
    provider: isProviderId(record.provider)
      ? record.provider
      : DEFAULT_MODEL_PROVIDER_SETTINGS.provider,
    apiKeySource: isApiKeySource(record.apiKeySource)
      ? record.apiKeySource
      : DEFAULT_MODEL_PROVIDER_SETTINGS.apiKeySource,
    apiKey:
      typeof record.apiKey === "string"
        ? record.apiKey
        : DEFAULT_MODEL_PROVIDER_SETTINGS.apiKey,
    apiKeyEnvVar:
      typeof record.apiKeyEnvVar === "string"
        ? record.apiKeyEnvVar
        : DEFAULT_MODEL_PROVIDER_SETTINGS.apiKeyEnvVar,
    customBaseUrl:
      typeof record.customBaseUrl === "string"
        ? record.customBaseUrl
        : DEFAULT_MODEL_PROVIDER_SETTINGS.customBaseUrl,
    customModels: parseModelDefinitions(record.customModels),
  };
}
