import {
  API_KEY_SOURCES,
  createDefaultCustomProviderSettings,
  createDefaultProviderSettings,
  DEFAULT_MODEL_PROVIDER_SETTINGS,
  isPresetProvider,
  PROVIDER_IDS,
} from "./constants";
import { parseModelDefinitions } from "./model-definition";
import type {
  ApiKeySource,
  CustomProviderSettings,
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

function parseCustomProviderSettings(
  raw: Record<string, unknown>,
  id: string
): CustomProviderSettings {
  const defaults = createDefaultCustomProviderSettings(id);

  return {
    id,
    name:
      typeof raw.name === "string" && raw.name.trim().length > 0
        ? raw.name.trim()
        : defaults.name,
    apiKeySource: isApiKeySource(raw.apiKeySource)
      ? raw.apiKeySource
      : defaults.apiKeySource,
    apiKey: typeof raw.apiKey === "string" ? raw.apiKey : defaults.apiKey,
    apiKeyEnvVar:
      typeof raw.apiKeyEnvVar === "string"
        ? raw.apiKeyEnvVar
        : defaults.apiKeyEnvVar,
    baseUrl:
      typeof raw.baseUrl === "string"
        ? raw.baseUrl
        : typeof raw.customBaseUrl === "string"
          ? raw.customBaseUrl
          : defaults.baseUrl,
    models: parseModelDefinitions(raw.models ?? raw.customModels),
    showUsage:
      typeof raw.showUsage === "boolean"
        ? raw.showUsage
        : defaults.showUsage,
  };
}

function parseCustomProviders(
  raw: unknown
): Record<string, CustomProviderSettings> {
  if (raw === null || raw === undefined || typeof raw !== "object") {
    return {};
  }

  const record = raw as Record<string, unknown>;
  const result: Record<string, CustomProviderSettings> = {};

  for (const [id, value] of Object.entries(record)) {
    if (
      !isPresetProvider(id) &&
      value !== null &&
      typeof value === "object"
    ) {
      result[id] = parseCustomProviderSettings(
        value as Record<string, unknown>,
        id
      );
    }
  }

  return result;
}

/** Migrates the legacy single `custom` provider slot into a customProviders entry. */
function migrateLegacyCustomProvider(
  record: Record<string, unknown>
): Record<string, CustomProviderSettings> {
  const providersRecord =
    record.providers !== null && typeof record.providers === "object"
      ? (record.providers as Record<string, unknown>)
      : undefined;
  const customRaw = (record.custom ?? providersRecord?.custom) as
    | Record<string, unknown>
    | undefined;

  if (customRaw === null || typeof customRaw !== "object") {
    return {};
  }

  return {
    "custom-legacy": parseCustomProviderSettings(customRaw, "custom-legacy"),
  };
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

function parseEnabledProviders(
  record: Record<string, unknown>,
  customProviders: Record<string, CustomProviderSettings>
): string[] {
  // New format: explicit enabledProviders array
  if (Array.isArray(record.enabledProviders)) {
    const enabled = record.enabledProviders.filter(
      (id): id is string =>
        typeof id === "string" &&
        (isPresetProvider(id) || id in customProviders)
    );
    // If nothing valid remained (e.g. all invalid), fall back to all presets
    // so the user never ends up with zero providers enabled.
    return enabled.length > 0 ? enabled : [...PROVIDER_IDS];
  }

  // Legacy format: only the activeProvider was in use
  return [...PROVIDER_IDS];
}

function parseActiveProvider(record: Record<string, unknown>): ProviderId {
  if (isProviderId(record.activeProvider)) {
    return record.activeProvider;
  }

  if (isProviderId(record.provider)) {
    return record.provider;
  }

  return "deepseek";
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

    return {
      enabledProviders: [...PROVIDER_IDS],
      providers,
      customProviders: {},
    };
  }

  const customProviders = parseCustomProviders(record.customProviders);
  const enabledProviders = parseEnabledProviders(record, customProviders);

  // If a legacy single `custom` provider slot exists (either top-level or
  // under `providers`), migrate it into a customProviders entry.
  const providersRecord =
    record.providers !== null && typeof record.providers === "object"
      ? (record.providers as Record<string, unknown>)
      : undefined;
  const hasLegacyCustom =
    (record.custom !== null && typeof record.custom === "object") ||
    (providersRecord?.custom !== null &&
      typeof providersRecord?.custom === "object");

  if (hasLegacyCustom && !("customProviders" in record)) {
    const legacy = migrateLegacyCustomProvider(record);
    Object.assign(customProviders, legacy);
    if (!enabledProviders.includes("custom-legacy")) {
      enabledProviders.push("custom-legacy");
    }
  }

  return {
    enabledProviders,
    providers: parseProvidersMap(record.providers),
    customProviders,
  };
}
