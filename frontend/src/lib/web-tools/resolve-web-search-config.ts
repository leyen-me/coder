import { DEFAULT_TAVILY_API_KEY_ENV_VAR } from "./constants";
import type { WebSearchConfig, WebToolsSettings } from "./types";

export function resolveWebSearchConfig(
  settings: WebToolsSettings
): WebSearchConfig | null {
  if (settings.webSearchProvider === "searxng") {
    const baseUrl = settings.searxngBaseUrl.trim();
    if (!baseUrl) {
      return null;
    }

    return {
      provider: "searxng",
      tavilyApiKeySource: settings.tavilyApiKeySource,
      tavilyApiKey: "",
      tavilyApiKeyEnvVar:
        settings.tavilyApiKeyEnvVar.trim() || DEFAULT_TAVILY_API_KEY_ENV_VAR,
      searxngBaseUrl: baseUrl,
    };
  }

  const apiKeyEnvVar =
    settings.tavilyApiKeyEnvVar.trim() || DEFAULT_TAVILY_API_KEY_ENV_VAR;

  if (settings.tavilyApiKeySource === "env") {
    return {
      provider: "tavily",
      tavilyApiKeySource: "env",
      tavilyApiKey: "",
      tavilyApiKeyEnvVar: apiKeyEnvVar,
      searxngBaseUrl: settings.searxngBaseUrl,
    };
  }

  const apiKey = settings.tavilyApiKey.trim();
  if (!apiKey) {
    return null;
  }

  return {
    provider: "tavily",
    tavilyApiKeySource: "manual",
    tavilyApiKey: apiKey,
    tavilyApiKeyEnvVar: apiKeyEnvVar,
    searxngBaseUrl: settings.searxngBaseUrl,
  };
}

export function getWebSearchConfigError(settings: WebToolsSettings): string {
  if (settings.webSearchProvider === "searxng") {
    return "SearXNG base URL is required. Configure it in Settings > Web tools.";
  }

  return "Tavily API key is required. Configure it in Settings > Web tools.";
}

/** @deprecated Use resolveWebSearchConfig */
export function resolveTavilyConfig(settings: WebToolsSettings) {
  const config = resolveWebSearchConfig(settings);
  if (!config || config.provider !== "tavily") {
    return null;
  }

  return {
    apiKeySource: config.tavilyApiKeySource,
    apiKey: config.tavilyApiKey,
    apiKeyEnvVar: config.tavilyApiKeyEnvVar,
  };
}
