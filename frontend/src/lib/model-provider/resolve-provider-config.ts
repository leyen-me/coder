import {
  isPresetProvider,
  PRESET_PROVIDERS,
  usesUserManagedModels,
} from "./constants";
import { findModelDefinition } from "./model-definition";
import type {
  ModelDefinition,
  ModelProviderSettings,
  ResolvedProviderConfig,
} from "./types";

/**
 * Separator used to build a composite model-selection value
 * `<providerId>::<modelId>`. A composite value uniquely identifies a model
 * *within a specific provider*, which lets the same model id (e.g. `gpt-4o`)
 * be exposed by multiple providers and still be distinguishable in the picker.
 */
export const MODEL_VALUE_SEPARATOR = "::";

/** A model together with the provider that owns it, keyed by a unique value. */
export type ModelProviderEntry = {
  providerId: string;
  model: ModelDefinition;
  /** Unique selection value: `${providerId}::${model.id}`. */
  value: string;
};

export function makeModelValue(providerId: string, modelId: string): string {
  return `${providerId}${MODEL_VALUE_SEPARATOR}${modelId}`;
}

/**
 * Splits a stored model value into its provider and model id parts.
 * Legacy plain model ids (no separator) are returned with an empty
 * `providerId` so callers can fall back to inference.
 */
export function parseModelValue(value: string): {
  providerId: string;
  modelId: string;
} {
  const trimmed = value.trim();
  const index = trimmed.indexOf(MODEL_VALUE_SEPARATOR);
  if (index === -1) {
    return { providerId: "", modelId: trimmed };
  }
  return {
    providerId: trimmed.slice(0, index),
    modelId: trimmed.slice(index + MODEL_VALUE_SEPARATOR.length),
  };
}

export function isModelValue(value: string): boolean {
  return value.includes(MODEL_VALUE_SEPARATOR);
}

export function resolveProviderConfig(
  settings: ModelProviderSettings,
  providerId: string
): ResolvedProviderConfig {
  if (isPresetProvider(providerId)) {
    const providerSettings = settings.providers[providerId];
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

  const custom = settings.customProviders[providerId];

  if (!custom) {
    return {
      provider: providerId,
      baseUrl: "",
      apiKeySource: "env",
      apiKey: "",
      apiKeyEnvVar: "",
      models: [],
    };
  }

  return {
    provider: providerId,
    baseUrl: custom.baseUrl.trim(),
    apiKeySource: custom.apiKeySource,
    apiKey: custom.apiKey,
    apiKeyEnvVar: custom.apiKeyEnvVar.trim(),
    models: custom.models,
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
 * Resolves the provider config for a stored model value. If the value is a
 * composite `<providerId>::<modelId>` and that provider is known, its config
 * is returned directly; otherwise (legacy plain model id) the provider is
 * inferred from the model id.
 */
export function resolveProviderForValue(
  settings: ModelProviderSettings,
  value: string
): ResolvedProviderConfig | null {
  const { providerId, modelId } = parseModelValue(value);
  const knownProvider =
    providerId &&
    (isPresetProvider(providerId) || providerId in settings.customProviders);
  if (knownProvider) {
    return resolveProviderConfig(settings, providerId);
  }
  return resolveProviderForModel(settings, modelId);
}

/**
 * Finds the entry matching a stored model value. Matches by the composite
 * `value` first, then falls back to a legacy plain model id (matched against
 * the first provider that exposes it).
 */
export function findModelEntry(
  entries: readonly ModelProviderEntry[] | undefined,
  value: string
): ModelProviderEntry | undefined {
  if (!entries) {
    return undefined;
  }

  for (const entry of entries) {
    if (entry.value === value) {
      return entry;
    }
  }

  const { modelId } = parseModelValue(value);
  if (modelId) {
    for (const entry of entries) {
      if (entry.model.id === modelId) {
        return entry;
      }
    }
  }

  return undefined;
}

/**
 * Merges all models from all enabled providers into a flat list plus a list
 * of provider-tagged entries. Unlike the flat list, `entries` is keyed by a
 * unique composite value, so two providers exposing the same model id both
 * appear (neither is dropped).
 */
export function mergeAllModels(
  settings: ModelProviderSettings
): { models: ModelDefinition[]; entries: ModelProviderEntry[] } {
  const models: ModelDefinition[] = [];
  const entries: ModelProviderEntry[] = [];

  for (const providerId of settings.enabledProviders) {
    const config = resolveProviderConfig(settings, providerId);
    for (const model of config.models) {
      if (!model.id.trim()) {
        continue;
      }
      models.push(model);
      entries.push({
        providerId,
        model,
        value: makeModelValue(providerId, model.id),
      });
    }
  }

  return { models, entries };
}
