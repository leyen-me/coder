import {
  DEFAULT_TAVILY_API_KEY_ENV_VAR,
  DEFAULT_WEB_TOOLS_SETTINGS,
} from "./constants";
import type { ApiKeySource, WebToolsSettings } from "./types";

function isApiKeySource(value: unknown): value is ApiKeySource {
  return value === "manual" || value === "env";
}

export function parseWebToolsSettings(raw: unknown): WebToolsSettings {
  if (raw === null || typeof raw !== "object" || Array.isArray(raw)) {
    return DEFAULT_WEB_TOOLS_SETTINGS;
  }

  const record = raw as Record<string, unknown>;
  const tavilyApiKeySource = record.tavilyApiKeySource;

  return {
    tavilyApiKeySource: isApiKeySource(tavilyApiKeySource)
      ? tavilyApiKeySource
      : DEFAULT_WEB_TOOLS_SETTINGS.tavilyApiKeySource,
    tavilyApiKey:
      typeof record.tavilyApiKey === "string"
        ? record.tavilyApiKey
        : DEFAULT_WEB_TOOLS_SETTINGS.tavilyApiKey,
    tavilyApiKeyEnvVar:
      typeof record.tavilyApiKeyEnvVar === "string" &&
      record.tavilyApiKeyEnvVar.trim().length > 0
        ? record.tavilyApiKeyEnvVar.trim()
        : DEFAULT_TAVILY_API_KEY_ENV_VAR,
  };
}
