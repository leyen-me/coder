import { invoke, isTauri } from "@tauri-apps/api/core";

import { toolFailure, toolSuccess } from "./result";
import { LIST_DIR_TOOL_NAME } from "./definitions";
import type { ListDirData, ToolHandler } from "./types";

type ListDirArgs = {
  path: string;
  recursive?: boolean;
  max_depth?: number;
  show_hidden?: boolean;
};

export const listDirHandler: ToolHandler = async (rawArgs, context) => {
  if (!isTauri()) {
    return toolFailure(
      LIST_DIR_TOOL_NAME,
      "unsupported_runtime",
      "list_dir is only available in the desktop app"
    );
  }

  if (!context.workspaceDir) {
    return toolFailure(
      LIST_DIR_TOOL_NAME,
      "workspace_required",
      "Select a workspace directory before listing files"
    );
  }

  const args = parseListDirArgs(rawArgs);
  if (!args.ok) {
    return toolFailure(LIST_DIR_TOOL_NAME, "invalid_arguments", args.message);
  }

  try {
    const data = await invoke<ListDirData>("tool_list_dir", {
      workspaceDir: context.workspaceDir,
      path: args.value.path,
      recursive: args.value.recursive ?? false,
      maxDepth: args.value.max_depth ?? 1,
      showHidden: args.value.show_hidden ?? false,
    });
    return toolSuccess(LIST_DIR_TOOL_NAME, data);
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    return toolFailure(LIST_DIR_TOOL_NAME, "execution_failed", message);
  }
};

function parseListDirArgs(
  rawArgs: unknown
): { ok: true; value: ListDirArgs } | { ok: false; message: string } {
  if (rawArgs === undefined || rawArgs === null) {
    return { ok: false, message: "path is required" };
  }

  if (typeof rawArgs !== "object" || Array.isArray(rawArgs)) {
    return { ok: false, message: "Arguments must be a JSON object" };
  }

  const record = rawArgs as Record<string, unknown>;
  const path = record.path;

  if (typeof path !== "string" || path.trim().length === 0) {
    return { ok: false, message: "path is required and must be a non-empty string" };
  }

  const recursive = record.recursive;
  if (recursive !== undefined && typeof recursive !== "boolean") {
    return { ok: false, message: "recursive must be a boolean" };
  }

  const maxDepth = record.max_depth;
  if (maxDepth !== undefined && typeof maxDepth !== "number") {
    return { ok: false, message: "max_depth must be a number" };
  }

  const showHidden = record.show_hidden;
  if (showHidden !== undefined && typeof showHidden !== "boolean") {
    return { ok: false, message: "show_hidden must be a boolean" };
  }

  return {
    ok: true,
    value: {
      path,
      recursive,
      max_depth: maxDepth,
      show_hidden: showHidden,
    },
  };
}
