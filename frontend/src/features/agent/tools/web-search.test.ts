import { describe, expect, it, vi } from "vitest";

vi.mock("@/lib/api/client", () => ({
  apiPost: vi.fn(),
}));

import { apiPost } from "@/lib/api/client";
import { WEB_SEARCH_TOOL_NAME } from "./definitions";
import { toolFailure, toolSuccess } from "./result";
import { webSearchHandler } from "./web-search";

const tavilyWebSearchConfig = {
  provider: "tavily" as const,
  tavilyApiKeySource: "manual" as const,
  tavilyApiKey: "tvly-test-key",
  tavilyApiKeyEnvVar: "TAVILY_API_KEY",
  searxngBaseUrl: "",
};

const searxngWebSearchConfig = {
  provider: "searxng" as const,
  tavilyApiKeySource: "manual" as const,
  tavilyApiKey: "",
  tavilyApiKeyEnvVar: "TAVILY_API_KEY",
  searxngBaseUrl: "https://searxng.example.com",
};

describe("webSearchHandler", () => {
  it("requires search_term in arguments", async () => {
    const result = await webSearchHandler(
      {},
      { workspaceDir: null, webSearchConfig: tavilyWebSearchConfig }
    );
    expect(result).toEqual(
      toolFailure(
        WEB_SEARCH_TOOL_NAME,
        "invalid_arguments",
        "search_term is required and must be a non-empty string"
      )
    );
  });

  it("requires web search configuration", async () => {
    const result = await webSearchHandler(
      { search_term: "rust async" },
      {
        workspaceDir: null,
        webSearchConfig: null,
        webSearchConfigError:
          "Tavily API key is required. Configure it in Settings > Web tools.",
      }
    );
    expect(result).toEqual(
      toolFailure(
        WEB_SEARCH_TOOL_NAME,
        "missing_api_key",
        "Tavily API key is required. Configure it in Settings > Web tools."
      )
    );
  });

  it("validates max_results range", async () => {
    const result = await webSearchHandler(
      { search_term: "rust async", max_results: 20 },
      { workspaceDir: null, webSearchConfig: tavilyWebSearchConfig }
    );
    expect(result).toEqual(
      toolFailure(
        WEB_SEARCH_TOOL_NAME,
        "invalid_arguments",
        "max_results must be between 1 and 10"
      )
    );
  });

  it("returns successful Tavily search results", async () => {
    vi.mocked(apiPost).mockResolvedValueOnce({
      query: "rust async",
      results: [
        {
          title: "Async book",
          url: "https://rust-lang.github.io/async-book/",
          snippet: "Asynchronous programming in Rust",
        },
      ],
      answer: "Rust has async/await support.",
    });

    const result = await webSearchHandler(
      { search_term: "rust async", max_results: 3 },
      {
        workspaceDir: null,
        webSearchConfig: tavilyWebSearchConfig,
        allowPrivateNetworkAccess: true,
      }
    );

    expect(result).toEqual(
      toolSuccess(WEB_SEARCH_TOOL_NAME, {
        query: "rust async",
        results: [
          {
            title: "Async book",
            url: "https://rust-lang.github.io/async-book/",
            snippet: "Asynchronous programming in Rust",
          },
        ],
        answer: "Rust has async/await support.",
      })
    );
    expect(apiPost).toHaveBeenCalledWith("/api/tool_web_search", {
      searchTerm: "rust async",
      provider: "tavily",
      apiKeySource: "manual",
      apiKey: "tvly-test-key",
      apiKeyEnvVar: "TAVILY_API_KEY",
      searxngBaseUrl: null,
      allowPrivateNetwork: true,
      maxResults: 3,
    });
  });

  it("returns successful SearXNG search results", async () => {
    vi.mocked(apiPost).mockResolvedValueOnce({
      query: "rust async",
      results: [
        {
          title: "Async book",
          url: "https://rust-lang.github.io/async-book/",
          snippet: "Asynchronous programming in Rust",
        },
      ],
    });

    const result = await webSearchHandler(
      { search_term: "rust async" },
      {
        workspaceDir: null,
        webSearchConfig: searxngWebSearchConfig,
        allowPrivateNetworkAccess: false,
      }
    );

    expect(result).toEqual(
      toolSuccess(WEB_SEARCH_TOOL_NAME, {
        query: "rust async",
        results: [
          {
            title: "Async book",
            url: "https://rust-lang.github.io/async-book/",
            snippet: "Asynchronous programming in Rust",
          },
        ],
      })
    );
    expect(apiPost).toHaveBeenCalledWith("/api/tool_web_search", {
      searchTerm: "rust async",
      provider: "searxng",
      apiKeySource: "manual",
      apiKey: null,
      apiKeyEnvVar: "TAVILY_API_KEY",
      searxngBaseUrl: "https://searxng.example.com",
      allowPrivateNetwork: false,
      maxResults: null,
    });
  });
});
