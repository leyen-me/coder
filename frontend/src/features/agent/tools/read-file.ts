
import { apiPost } from "@/lib/api/client";
import { toolFailure, toolSuccess } from "./result";
import { READ_FILE_TOOL_NAME } from "./definitions";
import { parseReadFileToolError } from "./parse-read-file-tool-error";
import type { ReadFileData, ToolHandler } from "./types";

type ReadFileArgs = {
  path: string;
  start_line?: number;
  max_lines?: number;
  respect_gitignore?: boolean;
};

export const readFileHandler: ToolHandler = async (rawArgs, context) => {

  if (!context.workspaceDir) {
    return toolFailure(
      READ_FILE_TOOL_NAME,
      "workspace_required",
      "Select a workspace directory before reading files"
    );
  }

  const args = parseReadFileArgs(rawArgs);
  if (!args.ok) {
    return toolFailure(READ_FILE_TOOL_NAME, "invalid_arguments", args.message);
  }

  try {
    const data = await apiPost<ReadFileData>("/api/tool_read_file", {
      workspaceDir: context.workspaceDir,
      path: args.value.path,
      startLine: args.value.start_line ?? 1,
      maxLines: args.value.max_lines ?? 500,
      respectGitignore: args.value.respect_gitignore ?? true,
    });
    return toolSuccess(READ_FILE_TOOL_NAME, data);
  } catch (error) {
    const structured = parseReadFileToolError(error);
    if (structured) {
      return toolFailure(
        READ_FILE_TOOL_NAME,
        structured.code,
        structured.message
      );
    }

    const message = error instanceof Error ? error.message : String(error);
    return toolFailure(READ_FILE_TOOL_NAME, "execution_failed", message);
  }
};

function parseReadFileArgs(
  rawArgs: unknown
): { ok: true; value: ReadFileArgs } | { ok: false; message: string } {
  if (rawArgs === undefined || rawArgs === null) {
    return { ok: false, message: "path is required" };
  }

  if (typeof rawArgs !== "object" || Array.isArray(rawArgs)) {
    return { ok: false, message: "Arguments must be a JSON object" };
  }

  const record = rawArgs as Record<string, unknown>;
  const path = record.path;

  if (typeof path !== "string" || path.trim().length === 0) {
    return { ok: false, message: "path is required and must be a non-empty string" };
  }

  const startLine = record.start_line;
  if (startLine !== undefined && typeof startLine !== "number") {
    return { ok: false, message: "start_line must be a number" };
  }

  const maxLines = record.max_lines;
  if (maxLines !== undefined && typeof maxLines !== "number") {
    return { ok: false, message: "max_lines must be a number" };
  }

  const respectGitignore = record.respect_gitignore;
  if (respectGitignore !== undefined && typeof respectGitignore !== "boolean") {
    return { ok: false, message: "respect_gitignore must be a boolean" };
  }

  return {
    ok: true,
    value: {
      path,
      start_line: startLine,
      max_lines: maxLines,
      respect_gitignore: respectGitignore,
    },
  };
}

