import { toolFailure, toolSuccess } from "./result";
import type { ToolHandler } from "./types";
import { readShellLogs } from "./shell-manager";

type ReadShellLogsArgs = {
  shell_id: string;
  stream?: "stdout" | "stderr";
  offset?: number;
  limit?: number;
};

export const readShellLogsHandler: ToolHandler = async (rawArgs, _context) => {
  const args = rawArgs as ReadShellLogsArgs;

  if (!args.shell_id?.trim()) {
    return toolFailure("read_shell_logs", "invalid_arguments", "shell_id is required");
  }

  const result = readShellLogs(
    args.shell_id.trim(),
    args.stream ?? "stdout",
    args.offset ?? 0,
    args.limit ?? 4096,
  );

  return toolSuccess("read_shell_logs", {
    shellId: args.shell_id.trim(),
    stream: args.stream ?? "stdout",
    data: result.data,
    offset: result.offset,
    totalBytes: result.totalBytes,
    truncated: result.truncated,
  });
};
