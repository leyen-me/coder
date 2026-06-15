export type ResponseStyleConfig = {
  enabled: boolean;
  selectedKey: string;
  customPrompts: Record<string, string>;
};

export type LabSettings = {
  promptRefineEnabled: boolean;
  promptRefineSystemPrompt: string;
  longTaskEnabled: boolean;
  responseStyle: ResponseStyleConfig;
  providerUsageEnabled: boolean;
};
