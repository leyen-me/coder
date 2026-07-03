import { describe, expect, it, vi } from "vitest";

import { WEB_SEARCH_TOOL_NAME } from "./definitions";
import { toolFailure, toolSuccess } from "./result";
import { webSearchHandler } from "./web-search";

vi.mock("@tauri-apps/api/core", () => ({
  isTauri: vi.fn(() => true),
  invoke: vi.fn(),
}));

import { invoke, isTauri } from "@tauri-apps/api/core";

const tavilyConfig = {
  apiKeySource: "manual" as const,
  apiKey: "tvly-test-key",
  apiKeyEnvVar: "TAVILY_API_KEY",
};

describe("webSearchHandler", () => {
  it("requires search_term in arguments", async () => {
    const result = await webSearchHandler({}, { workspaceDir: null, tavilyConfig });
    expect(result).toEqual(
      toolFailure(
        WEB_SEARCH_TOOL_NAME,
        "invalid_arguments",
        "search_term is required and must be a non-empty string"
      )
    );
  });

  it("requires Tavily API key configuration", async () => {
    const result = await webSearchHandler(
      { search_term: "rust async" },
      { workspaceDir: null, tavilyConfig: null }
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
      { workspaceDir: null, tavilyConfig }
    );
    expect(result).toEqual(
      toolFailure(
        WEB_SEARCH_TOOL_NAME,
        "invalid_arguments",
        "max_results must be between 1 and 10"
      )
    );
  });

  it("returns successful search results", async () => {
    vi.mocked(invoke).mockResolvedValueOnce({
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
      { workspaceDir: null, tavilyConfig }
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
    expect(invoke).toHaveBeenCalledWith("tool_web_search", {
      searchTerm: "rust async",
      apiKeySource: "manual",
      apiKey: "tvly-test-key",
      apiKeyEnvVar: "TAVILY_API_KEY",
      maxResults: 3,
    });
  });

  it("returns unsupported runtime outside tauri", async () => {
    vi.mocked(isTauri).mockReturnValueOnce(false);

    const result = await webSearchHandler(
      { search_term: "rust async" },
      { workspaceDir: null, tavilyConfig }
    );

    expect(result).toEqual(
      toolFailure(
        WEB_SEARCH_TOOL_NAME,
        "unsupported_runtime",
        "web_search is only available in the desktop app"
      )
    );
  });
});
