import { readFileSync, writeFileSync, existsSync } from "node:fs";
import { resolve } from "node:path";
import { createHash } from "node:crypto";
import { toolFailure, toolSuccess } from "./result";
import type { ToolHandler } from "./types";

type ReplaceLinesArgs = {
  path: string;
  start_line: number;
  end_line: number;
  content: string;
  expected_sha256?: string;
  create_backup?: boolean;
  respect_gitignore?: boolean;
};

export const replaceLinesHandler: ToolHandler = async (rawArgs, context) => {
  const args = rawArgs as ReplaceLinesArgs;

  if (!context.workspaceDir) {
    return toolFailure("replace_lines", "workspace_required", "No workspace directory set");
  }

  const filePath = resolve(context.workspaceDir, args.path);

  if (!existsSync(filePath)) {
    return toolFailure("replace_lines", "not_found", `File not found: ${args.path}`);
  }

  try {
    const oldContent = readFileSync(filePath, "utf-8");
    const oldLines = oldContent.split("\n");

    // Verify SHA256 if provided
    if (args.expected_sha256) {
      const actualHash = createHash("sha256").update(oldContent).digest("hex");
      if (actualHash !== args.expected_sha256) {
        return toolFailure(
          "replace_lines",
          "content_changed",
          `File content changed since last read. Expected SHA256: ${args.expected_sha256}, got: ${actualHash}.`,
        );
      }
    }

    // Validate line range
    if (args.start_line < 1 || args.end_line < args.start_line || args.start_line > oldLines.length) {
      return toolFailure(
        "replace_lines",
        "invalid_range",
        `Invalid line range: ${args.start_line}-${args.end_line}. File has ${oldLines.length} lines.`,
      );
    }

    const endLine = Math.min(args.end_line, oldLines.length);
    const replacementLines = args.content === "" ? [] : args.content.split("\n");

    // Build new content: lines before start + replacement + lines after end
    const before = oldLines.slice(0, args.start_line - 1);
    const after = oldLines.slice(endLine);
    const newContent = [...before, ...replacementLines, ...after].join("\n");

    writeFileSync(filePath, newContent, "utf-8");

    return toolSuccess("replace_lines", {
      path: args.path,
      action: "modified",
      bytesWritten: Buffer.byteLength(newContent, "utf-8"),
      linesAdded: replacementLines.length,
      linesRemoved: endLine - args.start_line + 1,
    });
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    return toolFailure("replace_lines", "write_error", message);
  }
};
