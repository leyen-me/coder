import { WEB_SEARCH_TOOL_NAME } from "./definitions";
import type { WebSearchData, WebSearchResultItem } from "./types";

export function getWebSearchChipLabel(
  toolName: string,
  input: unknown,
  output: unknown,
): string | null {
  if (toolName !== WEB_SEARCH_TOOL_NAME) {
    return null;
  }

  const inputRecord = asRecord(input);
  const query =
    typeof inputRecord?.search_term === "string"
      ? inputRecord.search_term.trim()
      : "";

  const data = extractWebSearchData(output);
  const resultCount = data?.results.length ?? 0;

  const queryPreview = query
    ? query.length > 36
      ? `${query.slice(0, 36)}…`
      : query
    : "";

  if (queryPreview) {
    return `web_search: "${queryPreview}" (${resultCount})`;
  }

  return `web_search (${resultCount} results)`;
}

export function formatWebSearchOutputForDisplay(output: unknown): {
  query: string;
  results: WebSearchResultItem[];
  answer?: string;
} | null {
  const data = extractWebSearchData(output);
  if (!data) {
    return null;
  }

  return {
    query: data.query,
    results: data.results,
    answer: data.answer,
  };
}

export function extractWebSearchData(output: unknown): WebSearchData | null {
  const envelope = asRecord(output);
  if (!envelope || envelope.ok !== true) {
    return null;
  }

  const data = envelope.data;
  if (!data || typeof data !== "object") {
    return null;
  }

  const record = data as Record<string, unknown>;
  if (typeof record.query !== "string") {
    return null;
  }

  return {
    query: record.query,
    results: Array.isArray(record.results)
      ? (record.results as WebSearchResultItem[])
      : [],
    answer: typeof record.answer === "string" ? record.answer : undefined,
  };
}

function asRecord(value: unknown): Record<string, unknown> | null {
  if (typeof value === "object" && value !== null && !Array.isArray(value)) {
    return value as Record<string, unknown>;
  }
  return null;
}
