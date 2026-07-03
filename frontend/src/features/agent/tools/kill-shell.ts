
import { apiPost } from "@/lib/api/client";
import { KILL_SHELL_TOOL_NAME } from "./definitions";
import { toolFailure, toolSuccess } from "./result";
import type { KillShellData, ToolHandler } from "./types";

type KillShellArgs = {
  shell_id: string;
};

export const killShellHandler: ToolHandler = async (rawArgs, _context) => {


  const args = parseKillShellArgs(rawArgs);
  if (!args.ok) {
    return toolFailure(KILL_SHELL_TOOL_NAME, "invalid_arguments", args.message);
  }

  try {
    await apiPost("/api/shell_kill", { shellId: args.value.shell_id });
    const data: KillShellData = { shellId: args.value.shell_id, killed: true };
    return toolSuccess(KILL_SHELL_TOOL_NAME, data);
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    return toolFailure(KILL_SHELL_TOOL_NAME, "execution_failed", message);
  }
};

function parseKillShellArgs(
  rawArgs: unknown
): { ok: true; value: KillShellArgs } | { ok: false; message: string } {
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

  return {
    ok: true,
    value: {
      shell_id: shellId,
    },
  };
}
