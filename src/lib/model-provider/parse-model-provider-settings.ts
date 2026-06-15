import {
  API_KEY_SOURCES,
  createDefaultProviderSettings,
  DEFAULT_MODEL_PROVIDER_SETTINGS,
  PROVIDER_IDS,
} from "./constants";
import { parseModelDefinitions } from "./model-definition";
import type {
  ApiKeySource,
  ModelProviderSettings,
  ProviderId,
  ProviderSettings,
} from "./types";

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

function parseProviderSettings(
  raw: Record<string, unknown>,
  provider: ProviderId
): ProviderSettings {
  const defaults = createDefaultProviderSettings(provider);

  return {
    apiKeySource: isApiKeySource(raw.apiKeySource)
      ? raw.apiKeySource
      : defaults.apiKeySource,
    apiKey:
      typeof raw.apiKey === "string" ? raw.apiKey : defaults.apiKey,
    apiKeyEnvVar:
      typeof raw.apiKeyEnvVar === "string"
        ? raw.apiKeyEnvVar
        : defaults.apiKeyEnvVar,
    customBaseUrl:
      typeof raw.customBaseUrl === "string"
        ? raw.customBaseUrl
        : defaults.customBaseUrl,
    customModels: parseModelDefinitions(raw.customModels),
    showUsage:
      typeof raw.showUsage === "boolean"
        ? raw.showUsage
        : defaults.showUsage,
  };
}

function createDefaultProvidersMap(): Record<ProviderId, ProviderSettings> {
  return Object.fromEntries(
    PROVIDER_IDS.map((id) => [id, createDefaultProviderSettings(id)])
  ) as Record<ProviderId, ProviderSettings>;
}

function parseProvidersMap(raw: unknown): Record<ProviderId, ProviderSettings> {
  const providers = createDefaultProvidersMap();

  if (raw === null || raw === undefined || typeof raw !== "object") {
    return providers;
  }

  const record = raw as Record<string, unknown>;

  for (const providerId of PROVIDER_IDS) {
    const providerRaw = record[providerId];
    if (providerRaw !== null && typeof providerRaw === "object") {
      providers[providerId] = parseProviderSettings(
        providerRaw as Record<string, unknown>,
        providerId
      );
    }
  }

  return providers;
}

function isLegacySettingsFormat(record: Record<string, unknown>): boolean {
  return (
    !("providers" in record) &&
    ("provider" in record ||
      "apiKey" in record ||
      "apiKeySource" in record ||
      "apiKeyEnvVar" in record ||
      "customBaseUrl" in record ||
      "customModels" in record)
  );
}

function parseActiveProvider(record: Record<string, unknown>): ProviderId {
  if (isProviderId(record.activeProvider)) {
    return record.activeProvider;
  }

  if (isProviderId(record.provider)) {
    return record.provider;
  }

  return DEFAULT_MODEL_PROVIDER_SETTINGS.activeProvider;
}

export function parseModelProviderSettings(
  raw: unknown
): ModelProviderSettings {
  if (raw === null || raw === undefined || typeof raw !== "object") {
    return DEFAULT_MODEL_PROVIDER_SETTINGS;
  }

  const record = raw as Record<string, unknown>;

  if (isLegacySettingsFormat(record)) {
    const activeProvider = parseActiveProvider(record);
    const providers = createDefaultProvidersMap();
    providers[activeProvider] = parseProviderSettings(record, activeProvider);

    return { activeProvider, providers };
  }

  return {
    activeProvider: parseActiveProvider(record),
    providers: parseProvidersMap(record.providers),
  };
}
