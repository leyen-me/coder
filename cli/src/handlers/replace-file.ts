import { writeFileSync, readFileSync, existsSync, mkdirSync } from "node:fs";
import { resolve, dirname } from "node:path";
import { createHash } from "node:crypto";
import { toolFailure, toolSuccess } from "./result";
import type { ToolHandler } from "./types";

type ReplaceFileArgs = {
  path: string;
  content: string;
  expected_sha256?: string;
  create_backup?: boolean;
  respect_gitignore?: boolean;
};

export const replaceFileHandler: ToolHandler = async (rawArgs, context) => {
  const args = rawArgs as ReplaceFileArgs;

  if (!context.workspaceDir) {
    return toolFailure("replace_file", "workspace_required", "No workspace directory set");
  }

  const filePath = resolve(context.workspaceDir, args.path);

  if (!existsSync(filePath)) {
    return toolFailure("replace_file", "not_found", `File not found: ${args.path}`);
  }

  try {
    const oldContent = readFileSync(filePath, "utf-8");
    const oldLines = oldContent.split("\n");
    const newLines = args.content.split("\n");

    // Verify SHA256 if provided
    if (args.expected_sha256) {
      const actualHash = createHash("sha256").update(oldContent).digest("hex");
      if (actualHash !== args.expected_sha256) {
        return toolFailure(
          "replace_file",
          "content_changed",
          `File content changed since last read. Expected SHA256: ${args.expected_sha256}, got: ${actualHash}. Read the file again to get the latest content.`,
        );
      }
    }

    writeFileSync(filePath, args.content, "utf-8");

    return toolSuccess("replace_file", {
      path: args.path,
      action: "replaced",
      bytesWritten: Buffer.byteLength(args.content, "utf-8"),
      linesAdded: newLines.length,
      linesRemoved: oldLines.length,
    });
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    return toolFailure("replace_file", "write_error", message);
  }
};
