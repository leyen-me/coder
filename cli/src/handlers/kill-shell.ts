import { toolFailure, toolSuccess } from "./result";
import type { ToolHandler } from "./types";
import { killShell, readShellLogs } from "./shell-manager";

type KillShellArgs = {
  shell_id: string;
};

export const killShellHandler: ToolHandler = async (rawArgs, _context) => {
  const args = rawArgs as KillShellArgs;

  if (!args.shell_id?.trim()) {
    return toolFailure("kill_shell", "invalid_arguments", "shell_id is required");
  }

  const killed = killShell(args.shell_id.trim());
  return toolSuccess("kill_shell", {
    shellId: args.shell_id.trim(),
    killed,
  });
};
