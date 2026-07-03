
import { toolFailure, toolSuccess } from "./result";
import { GET_WORKSPACE_TREE_TOOL_NAME } from "./definitions";
import type { ToolHandler, WorkspaceTreeData } from "./types";

type GetWorkspaceTreeArgs = {
  start_line?: number;
  max_lines?: number;
};

export const getWorkspaceTreeHandler: ToolHandler = async (
  rawArgs,
  context
) => {


  if (!context.workspaceDir) {
    return toolFailure(
      GET_WORKSPACE_TREE_TOOL_NAME,
      "workspace_required",
      "Select a workspace directory before exploring the workspace tree"
    );
  }

  const args = parseArgs(rawArgs);
  if (!args.ok) {
    return toolFailure(
      GET_WORKSPACE_TREE_TOOL_NAME,
      "invalid_arguments",
      args.message
    );
  }

  try {
    const data = await invoke<WorkspaceTreeData>("tool_get_workspace_tree", {
      workspaceDir: context.workspaceDir,
      startLine: args.value.start_line ?? null,
      maxLines: args.value.max_lines ?? null,
    });
    return toolSuccess(GET_WORKSPACE_TREE_TOOL_NAME, data);
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    return toolFailure(
      GET_WORKSPACE_TREE_TOOL_NAME,
      "execution_failed",
      message
    );
  }
};

function parseArgs(
  rawArgs: unknown
): { ok: true; value: GetWorkspaceTreeArgs } | { ok: false; message: string } {
  if (rawArgs === undefined || rawArgs === null) {
    return { ok: true, value: {} };
  }

  if (typeof rawArgs !== "object" || Array.isArray(rawArgs)) {
    return { ok: false, message: "Arguments must be a JSON object" };
  }

  const record = rawArgs as Record<string, unknown>;
  const startLine = record.start_line;
  const maxLines = record.max_lines;

  if (startLine !== undefined && (typeof startLine !== "number" || !Number.isInteger(startLine) || startLine < 1)) {
    return { ok: false, message: "start_line must be a positive integer" };
  }

  if (maxLines !== undefined && (typeof maxLines !== "number" || !Number.isInteger(maxLines) || maxLines < 1)) {
    return { ok: false, message: "max_lines must be a positive integer" };
  }

  return {
    ok: true,
    value: {
      start_line: startLine,
      max_lines: maxLines,
    },
  };
}
