import { describe, expect, it } from "vitest";

import { resolveWebSearchConfig } from "./resolve-web-search-config";

describe("resolveWebSearchConfig", () => {
  it("returns null for manual Tavily key when key is blank", () => {
    expect(
      resolveWebSearchConfig({
        webSearchProvider: "tavily",
        tavilyApiKeySource: "manual",
        tavilyApiKey: "  ",
        tavilyApiKeyEnvVar: "TAVILY_API_KEY",
        searxngBaseUrl: "",
        allowPrivateNetworkAccess: true,
      })
    ).toBeNull();
  });

  it("returns manual Tavily config when key is present", () => {
    expect(
      resolveWebSearchConfig({
        webSearchProvider: "tavily",
        tavilyApiKeySource: "manual",
        tavilyApiKey: "tvly-test",
        tavilyApiKeyEnvVar: "TAVILY_API_KEY",
        searxngBaseUrl: "",
        allowPrivateNetworkAccess: true,
      })
    ).toEqual({
      provider: "tavily",
      tavilyApiKeySource: "manual",
      tavilyApiKey: "tvly-test",
      tavilyApiKeyEnvVar: "TAVILY_API_KEY",
      searxngBaseUrl: "",
    });
  });

  it("returns env Tavily config without requiring a manual key", () => {
    expect(
      resolveWebSearchConfig({
        webSearchProvider: "tavily",
        tavilyApiKeySource: "env",
        tavilyApiKey: "",
        tavilyApiKeyEnvVar: "CUSTOM_TAVILY_KEY",
        searxngBaseUrl: "",
        allowPrivateNetworkAccess: true,
      })
    ).toEqual({
      provider: "tavily",
      tavilyApiKeySource: "env",
      tavilyApiKey: "",
      tavilyApiKeyEnvVar: "CUSTOM_TAVILY_KEY",
      searxngBaseUrl: "",
    });
  });

  it("returns null for SearXNG when base URL is blank", () => {
    expect(
      resolveWebSearchConfig({
        webSearchProvider: "searxng",
        tavilyApiKeySource: "manual",
        tavilyApiKey: "",
        tavilyApiKeyEnvVar: "TAVILY_API_KEY",
        searxngBaseUrl: "  ",
        allowPrivateNetworkAccess: true,
      })
    ).toBeNull();
  });

  it("returns SearXNG config when base URL is present", () => {
    expect(
      resolveWebSearchConfig({
        webSearchProvider: "searxng",
        tavilyApiKeySource: "manual",
        tavilyApiKey: "",
        tavilyApiKeyEnvVar: "TAVILY_API_KEY",
        searxngBaseUrl: "https://searxng.example.com",
        allowPrivateNetworkAccess: true,
      })
    ).toEqual({
      provider: "searxng",
      tavilyApiKeySource: "manual",
      tavilyApiKey: "",
      tavilyApiKeyEnvVar: "TAVILY_API_KEY",
      searxngBaseUrl: "https://searxng.example.com",
    });
  });
});
