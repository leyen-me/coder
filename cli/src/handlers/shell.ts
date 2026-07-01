import { toolFailure, toolSuccess } from "./result";
import type { ShellData, ToolHandler } from "./types";
import { executeShell } from "./shell-manager";

type ShellArgs = {
  command: string;
  description?: string;
  working_directory?: string;
  block_until_ms?: number;
};

export const shellHandler: ToolHandler = async (rawArgs, context) => {
  const args = rawArgs as ShellArgs;

  if (!args.command?.trim()) {
    return toolFailure("shell", "invalid_arguments", "Command is required");
  }

  try {
    const result = await executeShell(args.command.trim(), {
      workingDirectory: args.working_directory,
      description: args.description,
      blockUntilMs: args.block_until_ms ?? 30000,
      taskId: context.taskId,
      workspaceDir: context.workspaceDir,
    });

    return toolSuccess("shell", result);
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    return toolFailure("shell", "execution_error", message);
  }
};
