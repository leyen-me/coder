import { toolFailure, toolSuccess } from "./result";
import type { ToolHandler } from "./types";

type BrowsePageArgs = {
  url: string;
  max_lines?: number;
  start_line?: number;
  explanation?: string;
};

export const browsePageHandler: ToolHandler = async (rawArgs, _context) => {
  const args = rawArgs as BrowsePageArgs;

  if (!args.url?.trim()) {
    return toolFailure("browse_page", "invalid_arguments", "url is required");
  }

  try {
    const response = await fetch(args.url.trim(), {
      headers: {
        "User-Agent": "Mozilla/5.0 (compatible; CoderCLI/1.0)",
        Accept: "text/html,text/plain,*/*",
      },
      signal: AbortSignal.timeout(15000),
    });

    const contentType = response.headers.get("content-type") ?? "text/plain";
    const finalUrl = response.url;
    const title = extractTitleFromUrl(finalUrl);

    let content = await response.text();

    // Truncate if needed
    const startLine = args.start_line ?? 1;
    const maxLines = args.max_lines ?? 500;
    const lines = content.split("\n");
    const totalLines = lines.length;
    const endLine = Math.min(startLine + maxLines - 1, totalLines);
    const paginatedContent = lines.slice(startLine - 1, endLine).join("\n");

    return toolSuccess("browse_page", {
      url: args.url,
      finalUrl,
      title,
      content: paginatedContent,
      truncated: endLine < totalLines,
      statusCode: response.status,
      contentType,
    });
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    if (message.includes("fetch")) {
      return toolFailure("browse_page", "network_error", `Failed to fetch URL: ${message}`);
    }
    return toolFailure("browse_page", "error", message);
  }
};

function extractTitleFromUrl(url: string): string | undefined {
  try {
    const parsed = new URL(url);
    return parsed.hostname;
  } catch {
    return undefined;
  }
}
