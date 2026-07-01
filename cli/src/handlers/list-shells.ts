import { toolFailure, toolSuccess } from "./result";
import type { ToolHandler } from "./types";
import { listShells } from "./shell-manager";

type ListShellsArgs = {
  status_filter?: string;
};

export const listShellsHandler: ToolHandler = async (rawArgs, _context) => {
  const args = rawArgs as ListShellsArgs;

  const shells = listShells(args.status_filter);

  return toolSuccess("list_shells", {
    shells,
    total: shells.length,
  });
};
