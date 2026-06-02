import { invoke, isTauri } from "@tauri-apps/api/core";

import { toolFailure, toolSuccess } from "./result";
import { LIST_DIR_TOOL_NAME } from "./definitions";
import type { ListDirData, ToolHandler } from "./types";

type ListDirArgs = {
  path?: string;
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
      path: args.value.path ?? ".",
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
    return { ok: true, value: {} };
  }

  if (typeof rawArgs !== "object" || Array.isArray(rawArgs)) {
    return { ok: false, message: "Arguments must be a JSON object" };
  }

  const record = rawArgs as Record<string, unknown>;
  const path = record.path;

  if (path !== undefined && typeof path !== "string") {
    return { ok: false, message: "path must be a string" };
  }

  return { ok: true, value: { path } };
}
