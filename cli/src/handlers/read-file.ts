import { readFileSync, statSync } from "node:fs";
import { resolve } from "node:path";
import { toolFailure, toolSuccess } from "./result";
import type { ToolHandler } from "./types";

type ReadFileArgs = {
  path: string;
  start_line?: number;
  max_lines?: number;
  respect_gitignore?: boolean;
};

export const readFileHandler: ToolHandler = async (rawArgs, context) => {
  const args = rawArgs as ReadFileArgs;

  if (!context.workspaceDir) {
    return toolFailure("read_file", "workspace_required", "No workspace directory set");
  }

  const filePath = resolve(context.workspaceDir, args.path);
  const startLine = args.start_line ?? 1;
  const maxLines = args.max_lines ?? 500;

  try {
    statSync(filePath); // Check file exists
    const content = readFileSync(filePath, "utf-8");
    const lines = content.split("\n");
    const totalLines = lines.length;

    // Pagination
    const endLine = Math.min(startLine + maxLines - 1, totalLines);
    const paginatedContent = lines.slice(startLine - 1, endLine).join("\n");

    return toolSuccess("read_file", {
      path: filePath,
      encoding: "utf-8",
      mimeType: "text/plain",
      content: paginatedContent,
      totalLines,
      startLine,
      endLine,
      truncated: endLine < totalLines,
    });
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    if (message.includes("ENOENT")) {
      return toolFailure("read_file", "not_found", `File not found: ${filePath}`);
    }
    return toolFailure("read_file", "read_error", message);
  }
};
