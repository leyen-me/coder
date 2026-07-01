import { toolFailure, toolSuccess } from "./result";
import type { ToolHandler } from "./types";
import { awaitShell } from "./shell-manager";

type AwaitArgs = {
  shell_id: string;
  block_until_ms?: number;
};

export const awaitShellHandler: ToolHandler = async (rawArgs, _context) => {
  const args = rawArgs as AwaitArgs;

  if (!args.shell_id?.trim()) {
    return toolFailure("await", "invalid_arguments", "shell_id is required");
  }

  try {
    const result = await awaitShell(args.shell_id.trim(), args.block_until_ms ?? 30000);
    return toolSuccess("await", result);
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    return toolFailure("await", "error", message);
  }
};
