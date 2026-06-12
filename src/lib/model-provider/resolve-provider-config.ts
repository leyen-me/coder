import { PRESET_PROVIDERS, usesUserManagedModels } from "./constants";
import type { ModelProviderSettings, ResolvedProviderConfig } from "./types";

export function resolveProviderConfig(
  settings: ModelProviderSettings
): ResolvedProviderConfig {
  const provider = settings.activeProvider;
  const providerSettings = settings.providers[provider];

  if (provider === "custom") {
    return {
      provider,
      baseUrl: providerSettings.customBaseUrl.trim(),
      apiKeySource: providerSettings.apiKeySource,
      apiKey: providerSettings.apiKey,
      apiKeyEnvVar: providerSettings.apiKeyEnvVar.trim(),
      models: providerSettings.customModels,
    };
  }

  const preset = PRESET_PROVIDERS[provider];

  return {
    provider,
    baseUrl: preset.baseUrl,
    apiKeySource: providerSettings.apiKeySource,
    apiKey: providerSettings.apiKey,
    apiKeyEnvVar: providerSettings.apiKeyEnvVar.trim(),
    models: usesUserManagedModels(provider)
      ? providerSettings.customModels
      : preset.models,
  };
}
