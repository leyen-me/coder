import { readFileSync, writeFileSync, existsSync } from "node:fs";
import { resolve } from "node:path";
import { createHash } from "node:crypto";
import { toolFailure, toolSuccess } from "./result";
import type { ToolHandler } from "./types";

type EditFileArgs = {
  path: string;
  old_string: string;
  new_string: string;
  expected_sha256?: string;
  replace_all?: boolean;
  create_backup?: boolean;
  respect_gitignore?: boolean;
};

export const editFileHandler: ToolHandler = async (rawArgs, context) => {
  const args = rawArgs as EditFileArgs;

  if (!context.workspaceDir) {
    return toolFailure("edit_file", "workspace_required", "No workspace directory set");
  }

  const filePath = resolve(context.workspaceDir, args.path);

  if (!existsSync(filePath)) {
    return toolFailure("edit_file", "not_found", `File not found: ${args.path}`);
  }

  try {
    const oldContent = readFileSync(filePath, "utf-8");
    const oldLines = oldContent.split("\n");

    // Verify SHA256 if provided
    if (args.expected_sha256) {
      const actualHash = createHash("sha256").update(oldContent).digest("hex");
      if (actualHash !== args.expected_sha256) {
        return toolFailure(
          "edit_file",
          "content_changed",
          `File content changed since last read. Expected SHA256: ${args.expected_sha256}, got: ${actualHash}.`,
        );
      }
    }

    // Apply search-and-replace
    let newContent: string;
    if (args.replace_all) {
      newContent = oldContent.split(args.old_string).join(args.new_string);
    } else {
      const index = oldContent.indexOf(args.old_string);
      if (index === -1) {
        return toolFailure(
          "edit_file",
          "string_not_found",
          `Could not find the exact text to replace in ${args.path}. The text must match exactly.`,
        );
      }
      newContent = oldContent.slice(0, index) + args.new_string + oldContent.slice(index + args.old_string.length);
    }

    const newLines = newContent.split("\n");
    writeFileSync(filePath, newContent, "utf-8");

    // Calculate diff stats
    const linesAdded = newLines.length - oldLines.length;
    const linesRemoved = oldLines.length - newLines.length;

    return toolSuccess("edit_file", {
      path: args.path,
      action: "modified",
      bytesWritten: Buffer.byteLength(newContent, "utf-8"),
      linesAdded: linesAdded > 0 ? linesAdded : 0,
      linesRemoved: linesRemoved > 0 ? linesRemoved : 0,
    });
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    return toolFailure("edit_file", "write_error", message);
  }
};
