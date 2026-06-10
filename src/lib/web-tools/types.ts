export type ApiKeySource = "manual" | "env";

export type WebToolsSettings = {
  tavilyApiKeySource: ApiKeySource;
  tavilyApiKey: string;
  tavilyApiKeyEnvVar: string;
  allowPrivateNetworkAccess: boolean;
};

export type ResolvedTavilyConfig = {
  apiKeySource: ApiKeySource;
  apiKey: string;
  apiKeyEnvVar: string;
};
