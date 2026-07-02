import { toolFailure, toolSuccess } from "./result";
import type { ToolHandler } from "./types";
import { loadConfig, resolveTavilyApiKey } from "../config";

type WebSearchArgs = {
  search_term: string;
  max_results?: number;
  explanation?: string;
};

export const webSearchHandler: ToolHandler = async (rawArgs, _context) => {
  const args = rawArgs as WebSearchArgs;

  if (!args.search_term?.trim()) {
    return toolFailure("web_search", "invalid_arguments", "search_term is required");
  }

  const config = loadConfig();
  const tavilyKey = resolveTavilyApiKey(config);

  try {
    const results = await performWebSearch(args.search_term, args.max_results ?? 5, tavilyKey);

    return toolSuccess("web_search", {
      query: args.search_term,
      results,
    });
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    return toolFailure("web_search", "search_error", message);
  }
};

async function performWebSearch(
  query: string,
  maxResults: number,
  tavilyKey: string,
): Promise<Array<{ title: string; url: string; snippet: string }>> {
  // Try Tavily API first if a key is available
  if (tavilyKey) {
    try {
      const response = await fetch("https://api.tavily.com/search", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          api_key: tavilyKey,
          query,
          max_results: maxResults,
          search_depth: "basic",
        }),
        signal: AbortSignal.timeout(15000),
      });

      if (response.ok) {
        const data = (await response.json()) as {
          results?: Array<{ title: string; url: string; content: string }>;
        };
        if (data.results && data.results.length > 0) {
          return data.results.map((r) => ({
            title: r.title,
            url: r.url,
            snippet: r.content,
          }));
        }
      }
    } catch {
      // Fall through to DuckDuckGo
    }
  }

  // Fallback: DuckDuckGo instant answer API
  try {
    const url = `https://api.duckduckgo.com/?q=${encodeURIComponent(query)}&format=json&no_html=1&skip_disambig=1`;
    const response = await fetch(url, {
      signal: AbortSignal.timeout(10000),
    });

    if (!response.ok) throw new Error(`HTTP ${response.status}`);

    const data = (await response.json()) as {
      AbstractText?: string;
      AbstractSource?: string;
      AbstractURL?: string;
      RelatedTopics?: Array<{ Text?: string; FirstURL?: string; Result?: string }>;
    };

    const results: Array<{ title: string; url: string; snippet: string }> = [];

    if (data.AbstractText) {
      results.push({
        title: data.AbstractSource ?? "Result",
        url: data.AbstractURL ?? "",
        snippet: data.AbstractText,
      });
    }

    if (data.RelatedTopics) {
      for (const topic of data.RelatedTopics.slice(0, maxResults)) {
        if (topic.Text && topic.FirstURL) {
          results.push({
            title: topic.Text.split(" - ")[0] ?? "Result",
            url: topic.FirstURL,
            snippet: topic.Text,
          });
        }
      }
    }

    if (results.length === 0) {
      throw new Error("No results");
    }

    return results.slice(0, maxResults);
  } catch {
    throw new Error(
      "Web search is currently unavailable. Configure a Tavily API key via `coder config tavilyApiKey <key>` or set the TAVILY_API_KEY environment variable.",
    );
  }
}
