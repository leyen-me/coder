import { DEFAULT_TAVILY_API_KEY_ENV_VAR } from "./constants";
import type { ResolvedTavilyConfig, WebToolsSettings } from "./types";

export function resolveTavilyConfig(
  settings: WebToolsSettings
): ResolvedTavilyConfig | null {
  const apiKeyEnvVar =
    settings.tavilyApiKeyEnvVar.trim() || DEFAULT_TAVILY_API_KEY_ENV_VAR;

  if (settings.tavilyApiKeySource === "env") {
    return {
      apiKeySource: "env",
      apiKey: "",
      apiKeyEnvVar,
    };
  }

  const apiKey = settings.tavilyApiKey.trim();
  if (!apiKey) {
    return null;
  }

  return {
    apiKeySource: "manual",
    apiKey,
    apiKeyEnvVar,
  };
}
