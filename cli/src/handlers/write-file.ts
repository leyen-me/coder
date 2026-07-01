import { writeFileSync, mkdirSync, existsSync } from "node:fs";
import { resolve, dirname } from "node:path";
import { toolFailure, toolSuccess } from "./result";
import type { ToolHandler } from "./types";

type WriteFileArgs = {
  path: string;
  content: string;
  create_parent_dirs?: boolean;
};

export const writeFileHandler: ToolHandler = async (rawArgs, context) => {
  const args = rawArgs as WriteFileArgs;

  if (!context.workspaceDir) {
    return toolFailure("write_file", "workspace_required", "No workspace directory set");
  }

  const filePath = resolve(context.workspaceDir, args.path);

  // Prevent writing outside workspace
  if (!filePath.startsWith(context.workspaceDir.replace(/\\/g, "/").replace(/\\/g, "/"))) {
    return toolFailure("write_file", "path_escape", "Path escapes workspace directory");
  }

  if (existsSync(filePath)) {
    return toolFailure("write_file", "file_exists", `File already exists: ${args.path}. Use replace_file to overwrite.`);
  }

  try {
    if (args.create_parent_dirs !== false) {
      const parentDir = dirname(filePath);
      if (!existsSync(parentDir)) {
        mkdirSync(parentDir, { recursive: true });
      }
    }

    const lines = args.content.split("\n");
    writeFileSync(filePath, args.content, "utf-8");

    return toolSuccess("write_file", {
      path: args.path,
      action: "created",
      bytesWritten: Buffer.byteLength(args.content, "utf-8"),
      linesAdded: lines.length,
      linesRemoved: 0,
    });
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    return toolFailure("write_file", "write_error", message);
  }
};
