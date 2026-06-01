import { PRESET_PROVIDERS } from "./constants";
import type { ModelProviderSettings, ResolvedProviderConfig } from "./types";

export function resolveProviderConfig(
  settings: ModelProviderSettings
): ResolvedProviderConfig {
  if (settings.provider === "custom") {
    return {
      provider: settings.provider,
      baseUrl: settings.customBaseUrl.trim(),
      apiKeySource: settings.apiKeySource,
      apiKey: settings.apiKey,
      apiKeyEnvVar: settings.apiKeyEnvVar.trim(),
      models: settings.customModels,
    };
  }

  const preset = PRESET_PROVIDERS[settings.provider];

  return {
    provider: settings.provider,
    baseUrl: preset.baseUrl,
    apiKeySource: settings.apiKeySource,
    apiKey: settings.apiKey,
    apiKeyEnvVar: settings.apiKeyEnvVar.trim(),
    models: preset.models,
  };
}
