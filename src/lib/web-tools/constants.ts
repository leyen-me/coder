import type { WebToolsSettings } from "./types";

export const WEB_TOOLS_STORAGE_KEY = "coder:web-tools-settings";

export const DEFAULT_TAVILY_API_KEY_ENV_VAR = "TAVILY_API_KEY";

export const DEFAULT_WEB_TOOLS_SETTINGS: WebToolsSettings = {
  tavilyApiKeySource: "manual",
  tavilyApiKey: "",
  tavilyApiKeyEnvVar: DEFAULT_TAVILY_API_KEY_ENV_VAR,
};
