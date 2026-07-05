import { PRESET_PROVIDERS, usesUserManagedModels } from "./constants";
import { findModelDefinition } from "./model-definition";
import type {
  ModelDefinition,
  ModelProviderSettings,
  ProviderId,
  ResolvedProviderConfig,
} from "./types";

export function resolveProviderConfig(
  settings: ModelProviderSettings,
  providerId: ProviderId
): ResolvedProviderConfig {
  const providerSettings = settings.providers[providerId];

  if (providerId === "custom") {
    return {
      provider: providerId,
      baseUrl: providerSettings.customBaseUrl.trim(),
      apiKeySource: providerSettings.apiKeySource,
      apiKey: providerSettings.apiKey,
      apiKeyEnvVar: providerSettings.apiKeyEnvVar.trim(),
      models: providerSettings.customModels,
    };
  }

  const preset = PRESET_PROVIDERS[providerId];

  return {
    provider: providerId,
    baseUrl: preset.baseUrl,
    apiKeySource: providerSettings.apiKeySource,
    apiKey: providerSettings.apiKey,
    apiKeyEnvVar: providerSettings.apiKeyEnvVar.trim(),
    models: usesUserManagedModels(providerId)
      ? providerSettings.customModels
      : preset.models,
  };
}

/**
 * Finds which enabled provider owns the given modelId and returns
 * its resolved config. Returns null if no enabled provider has this model.
 */
export function resolveProviderForModel(
  settings: ModelProviderSettings,
  modelId: string
): ResolvedProviderConfig | null {
  for (const providerId of settings.enabledProviders) {
    const config = resolveProviderConfig(settings, providerId);
    if (findModelDefinition(config.models, modelId)) {
      return config;
    }
  }
  return null;
}

/**
 * Merges all models from all enabled providers into a flat list,
 * tagging each with the provider id for display purposes.
 */
export function mergeAllModels(
  settings: ModelProviderSettings
): { models: ModelDefinition[]; modelProviders: Map<string, ProviderId> } {
  const models: ModelDefinition[] = [];
  const modelProviders = new Map<string, ProviderId>();

  for (const providerId of settings.enabledProviders) {
    const config = resolveProviderConfig(settings, providerId);
    for (const model of config.models) {
      if (!model.id.trim() || modelProviders.has(model.id)) {
        continue;
      }

      modelProviders.set(model.id, providerId);
      models.push(model);
    }
  }

  return { models, modelProviders };
}
