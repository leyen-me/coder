import { describe, expect, it } from "vitest";

import { resolveTavilyConfig } from "./resolve-tavily-config";

describe("resolveTavilyConfig", () => {
  it("returns null when manual key is empty", () => {
    expect(
      resolveTavilyConfig({
        tavilyApiKeySource: "manual",
        tavilyApiKey: "  ",
        tavilyApiKeyEnvVar: "TAVILY_API_KEY",
        allowPrivateNetworkAccess: true,
      })
    ).toBeNull();
  });

  it("returns manual config when key is present", () => {
    expect(
      resolveTavilyConfig({
        tavilyApiKeySource: "manual",
        tavilyApiKey: "tvly-test",
        tavilyApiKeyEnvVar: "TAVILY_API_KEY",
        allowPrivateNetworkAccess: true,
      })
    ).toEqual({
      apiKeySource: "manual",
      apiKey: "tvly-test",
      apiKeyEnvVar: "TAVILY_API_KEY",
    });
  });

  it("returns env config without manual key", () => {
    expect(
      resolveTavilyConfig({
        tavilyApiKeySource: "env",
        tavilyApiKey: "",
        tavilyApiKeyEnvVar: "CUSTOM_TAVILY_KEY",
        allowPrivateNetworkAccess: true,
      })
    ).toEqual({
      apiKeySource: "env",
      apiKey: "",
      apiKeyEnvVar: "CUSTOM_TAVILY_KEY",
    });
  });
});
