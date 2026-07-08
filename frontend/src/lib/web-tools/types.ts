export type ApiKeySource = "manual" | "env";

export type WebSearchProvider = "tavily" | "searxng";

export type WebToolsSettings = {
  webSearchProvider: WebSearchProvider;
  tavilyApiKeySource: ApiKeySource;
  tavilyApiKey: string;
  tavilyApiKeyEnvVar: string;
  searxngBaseUrl: string;
  allowPrivateNetworkAccess: boolean;
};

export type WebSearchConfig = {
  provider: WebSearchProvider;
  tavilyApiKeySource: ApiKeySource;
  tavilyApiKey: string;
  tavilyApiKeyEnvVar: string;
  searxngBaseUrl: string;
};

/** @deprecated Use WebSearchConfig */
export type ResolvedTavilyConfig = {
  apiKeySource: ApiKeySource;
  apiKey: string;
  apiKeyEnvVar: string;
};
