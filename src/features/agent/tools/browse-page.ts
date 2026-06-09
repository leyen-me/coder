import { invoke, isTauri } from "@tauri-apps/api/core";

import { BROWSE_PAGE_TOOL_NAME } from "./definitions";
import { parseNetworkToolError } from "./network-tool-error";
import { toolFailure, toolSuccess } from "./result";
import type { BrowsePageData, ToolHandler } from "./types";

type BrowsePageArgs = {
  url: string;
  explanation?: string;
};

export const browsePageHandler: ToolHandler = async (rawArgs, _context) => {
  if (!isTauri()) {
    return toolFailure(
      BROWSE_PAGE_TOOL_NAME,
      "unsupported_runtime",
      "browse_page is only available in the desktop app"
    );
  }

  const args = parseBrowsePageArgs(rawArgs);
  if (!args.ok) {
    return toolFailure(BROWSE_PAGE_TOOL_NAME, "invalid_arguments", args.message);
  }

  try {
    const data = await invoke<BrowsePageData>("tool_browse_page", {
      url: args.value.url,
    });
    return toolSuccess(BROWSE_PAGE_TOOL_NAME, data);
  } catch (error) {
    const structured = parseNetworkToolError(error);
    if (structured) {
      return toolFailure(
        BROWSE_PAGE_TOOL_NAME,
        structured.code,
        structured.message
      );
    }

    const message = error instanceof Error ? error.message : String(error);
    return toolFailure(BROWSE_PAGE_TOOL_NAME, "execution_failed", message);
  }
};

function parseBrowsePageArgs(
  rawArgs: unknown
): { ok: true; value: BrowsePageArgs } | { ok: false; message: string } {
  if (rawArgs === undefined || rawArgs === null) {
    return { ok: false, message: "url is required" };
  }

  if (typeof rawArgs !== "object" || Array.isArray(rawArgs)) {
    return { ok: false, message: "Arguments must be a JSON object" };
  }

  const record = rawArgs as Record<string, unknown>;
  const url = record.url;

  if (typeof url !== "string" || url.trim().length === 0) {
    return {
      ok: false,
      message: "url is required and must be a non-empty string",
    };
  }

  const explanation = record.explanation;
  if (explanation !== undefined && typeof explanation !== "string") {
    return { ok: false, message: "explanation must be a string" };
  }

  return {
    ok: true,
    value: {
      url: url.trim(),
      explanation,
    },
  };
}
