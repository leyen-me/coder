
import { READ_SHELL_LOGS_TOOL_NAME } from "./definitions";
import { toolFailure, toolSuccess } from "./result";
import type { ReadShellLogsData, ToolHandler } from "./types";

type ReadShellLogsArgs = {
  shell_id: string;
  stream?: "stdout" | "stderr";
  offset?: number;
  limit?: number;
};

export const readShellLogsHandler: ToolHandler = async (rawArgs, _context) => {


  const args = parseReadShellLogsArgs(rawArgs);
  if (!args.ok) {
    return toolFailure(READ_SHELL_LOGS_TOOL_NAME, "invalid_arguments", args.message);
  }

  try {
    const data = await invoke<ReadShellLogsData>("shell_read_logs", {
      shellId: args.value.shell_id,
      stream: args.value.stream ?? null,
      offset: args.value.offset ?? null,
      limit: args.value.limit ?? null,
    });
    return toolSuccess(READ_SHELL_LOGS_TOOL_NAME, data);
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    return toolFailure(READ_SHELL_LOGS_TOOL_NAME, "execution_failed", message);
  }
};

function parseReadShellLogsArgs(
  rawArgs: unknown
): { ok: true; value: ReadShellLogsArgs } | { ok: false; message: string } {
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

  const stream = record.stream;
  if (stream !== undefined && stream !== "stdout" && stream !== "stderr") {
    return { ok: false, message: "stream must be 'stdout' or 'stderr'" };
  }

  const offset = record.offset;
  if (offset !== undefined && typeof offset !== "number") {
    return { ok: false, message: "offset must be a number" };
  }

  const limit = record.limit;
  if (limit !== undefined && typeof limit !== "number") {
    return { ok: false, message: "limit must be a number" };
  }

  return {
    ok: true,
    value: {
      shell_id: shellId,
      stream,
      offset,
      limit,
    },
  };
}
