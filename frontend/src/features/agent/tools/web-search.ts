
import { apiPost } from "@/lib/api/client";
import { WEB_SEARCH_TOOL_NAME } from "./definitions";
import { parseNetworkToolError } from "./network-tool-error";
import { toolFailure, toolSuccess } from "./result";
import type { ToolHandler, WebSearchData } from "./types";

type WebSearchArgs = {
  search_term: string;
  explanation?: string;
  max_results?: number;
};

export const webSearchHandler: ToolHandler = async (rawArgs, context) => {
  const args = parseWebSearchArgs(rawArgs);
  if (!args.ok) {
    return toolFailure(WEB_SEARCH_TOOL_NAME, "invalid_arguments", args.message);
  }

  const webSearchConfig = context.webSearchConfig;
  if (!webSearchConfig) {
    const message =
      context.webSearchConfigError ??
      "Web search is not configured. Configure it in Settings > Web tools.";
    return toolFailure(WEB_SEARCH_TOOL_NAME, "missing_api_key", message);
  }

  try {
    const data = await apiPost<WebSearchData>("/api/tool_web_search", {
      searchTerm: args.value.search_term,
      provider: webSearchConfig.provider,
      apiKeySource: webSearchConfig.tavilyApiKeySource,
      apiKey:
        webSearchConfig.provider === "tavily" &&
        webSearchConfig.tavilyApiKeySource === "manual"
          ? webSearchConfig.tavilyApiKey
          : null,
      apiKeyEnvVar: webSearchConfig.tavilyApiKeyEnvVar,
      searxngBaseUrl:
        webSearchConfig.provider === "searxng"
          ? webSearchConfig.searxngBaseUrl
          : null,
      allowPrivateNetwork: context.allowPrivateNetworkAccess ?? false,
      maxResults: args.value.max_results ?? null,
    });
    return toolSuccess(WEB_SEARCH_TOOL_NAME, data);
  } catch (error) {
    const structured = parseNetworkToolError(error);
    if (structured) {
      return toolFailure(
        WEB_SEARCH_TOOL_NAME,
        structured.code,
        structured.message
      );
    }

    const message = error instanceof Error ? error.message : String(error);
    return toolFailure(WEB_SEARCH_TOOL_NAME, "execution_failed", message);
  }
};

function parseWebSearchArgs(
  rawArgs: unknown
): { ok: true; value: WebSearchArgs } | { ok: false; message: string } {
  if (rawArgs === undefined || rawArgs === null) {
    return { ok: false, message: "search_term is required" };
  }

  if (typeof rawArgs !== "object" || Array.isArray(rawArgs)) {
    return { ok: false, message: "Arguments must be a JSON object" };
  }

  const record = rawArgs as Record<string, unknown>;
  const searchTerm = record.search_term;

  if (typeof searchTerm !== "string" || searchTerm.trim().length === 0) {
    return {
      ok: false,
      message: "search_term is required and must be a non-empty string",
    };
  }

  const explanation = record.explanation;
  if (explanation !== undefined && typeof explanation !== "string") {
    return { ok: false, message: "explanation must be a string" };
  }

  const maxResults = record.max_results;
  if (maxResults !== undefined) {
    if (typeof maxResults !== "number" || !Number.isInteger(maxResults)) {
      return { ok: false, message: "max_results must be an integer" };
    }
    if (maxResults < 1 || maxResults > 10) {
      return { ok: false, message: "max_results must be between 1 and 10" };
    }
  }

  return {
    ok: true,
    value: {
      search_term: searchTerm.trim(),
      explanation,
      max_results: maxResults,
    },
  };
}
