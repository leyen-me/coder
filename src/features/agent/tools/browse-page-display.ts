import { BROWSE_PAGE_TOOL_NAME } from "./definitions";
import type { BrowsePageData } from "./types";

/** Max page body characters rendered in the tool detail panel. */
export const BROWSE_PAGE_UI_CONTENT_MAX_CHARS = 48_000;

export function getBrowsePageChipLabel(
  toolName: string,
  input: unknown,
  output: unknown
): string | null {
  if (toolName !== BROWSE_PAGE_TOOL_NAME) {
    return null;
  }

  const inputRecord = asRecord(input);
  const inputUrl =
    typeof inputRecord?.url === "string" ? inputRecord.url.trim() : "";

  const data = extractBrowsePageData(output);
  const url = data?.finalUrl || data?.url || inputUrl;

  if (!url) {
    return BROWSE_PAGE_TOOL_NAME;
  }

  const preview = url.length > 48 ? `${url.slice(0, 48)}…` : url;
  const statusSuffix =
    data?.statusCode != null ? ` [${data.statusCode}]` : "";

  return `browse_page: ${preview}${statusSuffix}`;
}

export function formatBrowsePageOutputForDisplay(output: unknown): {
  metadataJson: string;
  content: string;
  contentDisplayTruncated: boolean;
  contentTotalChars: number;
  fetchTruncated: boolean;
} | null {
  const envelope = asRecord(output);
  if (!envelope || envelope.ok !== true || envelope.tool !== BROWSE_PAGE_TOOL_NAME) {
    return null;
  }

  const data = extractBrowsePageData(output);
  if (!data) {
    return null;
  }

  const contentTotalChars = data.content.length;
  const contentDisplayTruncated =
    contentTotalChars > BROWSE_PAGE_UI_CONTENT_MAX_CHARS;
  const content = contentDisplayTruncated
    ? data.content.slice(0, BROWSE_PAGE_UI_CONTENT_MAX_CHARS)
    : data.content;

  const metadataJson = JSON.stringify(
    {
      ok: true,
      tool: BROWSE_PAGE_TOOL_NAME,
      data: {
        url: data.url,
        finalUrl: data.finalUrl,
        title: data.title,
        statusCode: data.statusCode,
        contentType: data.contentType,
        truncated: data.truncated,
        contentChars: contentTotalChars,
      },
    },
    null,
    2
  );

  return {
    metadataJson,
    content,
    contentDisplayTruncated,
    contentTotalChars,
    fetchTruncated: data.truncated,
  };
}

export function extractBrowsePageData(output: unknown): BrowsePageData | null {
  const envelope = asRecord(output);
  if (!envelope || envelope.ok !== true) {
    return null;
  }

  const data = envelope.data;
  if (!data || typeof data !== "object") {
    return null;
  }

  const record = data as Record<string, unknown>;
  if (typeof record.url !== "string" || typeof record.content !== "string") {
    return null;
  }

  return {
    url: record.url,
    finalUrl:
      typeof record.finalUrl === "string" ? record.finalUrl : record.url,
    title: typeof record.title === "string" ? record.title : undefined,
    content: record.content,
    truncated: record.truncated === true,
    statusCode:
      typeof record.statusCode === "number" ? record.statusCode : 0,
    contentType:
      typeof record.contentType === "string" ? record.contentType : undefined,
  };
}

function asRecord(value: unknown): Record<string, unknown> | null {
  if (typeof value === "object" && value !== null && !Array.isArray(value)) {
    return value as Record<string, unknown>;
  }
  return null;
}
