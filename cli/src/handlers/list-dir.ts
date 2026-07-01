import { readdirSync, statSync } from "node:fs";
import { resolve, relative } from "node:path";
import { toolFailure, toolSuccess } from "./result";
import type { ListDirEntry, ToolHandler } from "./types";

type ListDirArgs = {
  path: string;
  recursive?: boolean;
  max_depth?: number;
  show_hidden?: boolean;
};

export const listDirHandler: ToolHandler = async (rawArgs, context) => {
  const args = rawArgs as ListDirArgs;

  if (!context.workspaceDir) {
    return toolFailure("list_dir", "workspace_required", "No workspace directory set");
  }

  const dirPath = resolve(context.workspaceDir, args.path);
  const maxDepth = args.recursive ? (args.max_depth ?? 1) : 1;

  try {
    const entries = walkDirectory(dirPath, 0, maxDepth, args.show_hidden ?? false);
    return toolSuccess("list_dir", {
      path: relative(context.workspaceDir, dirPath),
      entries,
    });
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    return toolFailure("list_dir", "read_error", message);
  }
};

function walkDirectory(
  dirPath: string,
  currentDepth: number,
  maxDepth: number,
  showHidden: boolean,
): ListDirEntry[] {
  const results: ListDirEntry[] = [];

  let entries: string[];
  try {
    entries = readdirSync(dirPath);
  } catch {
    return results;
  }

  for (const name of entries) {
    if (!showHidden && name.startsWith(".")) {
      continue;
    }

    const fullPath = resolve(dirPath, name);
    let stats: ReturnType<typeof statSync>;
    try {
      stats = statSync(fullPath);
    } catch {
      continue;
    }

    results.push({
      name,
      path: fullPath,
      isDir: stats.isDirectory(),
      size: stats.isFile() ? stats.size : undefined,
    });

    if (stats.isDirectory() && currentDepth < maxDepth) {
      results.push(...walkDirectory(fullPath, currentDepth + 1, maxDepth, showHidden));
    }
  }

  return results;
}
