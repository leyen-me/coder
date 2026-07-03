
import { AWAIT_TOOL_NAME } from "./definitions";
import { toolFailure, toolSuccess } from "./result";
import type { ShellData, ToolHandler } from "./types";

type AwaitArgs = {
  shell_id: string;
  block_until_ms?: number;
};

export const awaitShellHandler: ToolHandler = async (rawArgs, context) => {


  if (!context.workspaceDir) {
    return toolFailure(
      AWAIT_TOOL_NAME,
      "workspace_required",
      "Select a workspace directory before awaiting shell commands"
    );
  }

  const args = parseAwaitArgs(rawArgs);
  if (!args.ok) {
    return toolFailure(AWAIT_TOOL_NAME, "invalid_arguments", args.message);
  }

  try {
    const data = await invoke<ShellData>("tool_await", {
      shellId: args.value.shell_id,
      blockUntilMs: args.value.block_until_ms ?? null,
    });
    return toolSuccess(AWAIT_TOOL_NAME, data);
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    return toolFailure(AWAIT_TOOL_NAME, "execution_failed", message);
  }
};

function parseAwaitArgs(
  rawArgs: unknown
): { ok: true; value: AwaitArgs } | { ok: false; message: string } {
  if (rawArgs === undefined || rawArgs === null) {
    return { ok: false, message: "shell_id is required" };
  }

  if (typeof rawArgs !== "object" || Array.isArray(rawArgs)) {
    return { ok: false, message: "Arguments must be a JSON object" };
  }

  const record = rawArgs as Record<string, unknown>;
  const shellId = record.shell_id;

  if (typeof shellId !== "string" || shellId.trim().length === 0) {
    return {
      ok: false,
      message: "shell_id is required and must be a non-empty string",
    };
  }

  const blockUntilMs = record.block_until_ms;
  if (blockUntilMs !== undefined && typeof blockUntilMs !== "number") {
    return { ok: false, message: "block_until_ms must be a number" };
  }

  return {
    ok: true,
    value: {
      shell_id: shellId,
      block_until_ms: blockUntilMs,
    },
  };
};
