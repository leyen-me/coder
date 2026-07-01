import { invoke, isTauri } from "@tauri-apps/api/core";

import { toolFailure, toolSuccess } from "./result";
import { REPLACE_LINES_TOOL_NAME } from "./definitions";
import type { FileModifyData, FileModifyToolErrorPayload, ToolHandler } from "./types";

type ReplaceLinesArgs = {
  path: string;
  start_line: number;
  end_line: number;
  new_content: string;
  expected_sha256?: string;
  create_backup?: boolean;
  respect_gitignore?: boolean;
};

export const replaceLinesHandler: ToolHandler = async (rawArgs, context) => {
  if (!isTauri()) {
    return toolFailure(
      REPLACE_LINES_TOOL_NAME,
      "unsupported_runtime",
      "replace_lines is only available in the desktop app"
    );
  }

  if (!context.workspaceDir) {
    return toolFailure(
      REPLACE_LINES_TOOL_NAME,
      "workspace_required",
      "Select a workspace directory before editing files"
    );
  }

  const args = parseReplaceLinesArgs(rawArgs);
  if (!args.ok) {
    return toolFailure(REPLACE_LINES_TOOL_NAME, "invalid_arguments", args.message);
  }

  try {
    const data = await invoke<FileModifyData>("tool_replace_lines", {
      workspaceDir: context.workspaceDir,
      path: args.value.path,
      startLine: args.value.start_line,
      endLine: args.value.end_line,
      newContent: args.value.new_content,
      expectedSha256: args.value.expected_sha256,
      createBackup: args.value.create_backup ?? false,
      respectGitignore: args.value.respect_gitignore ?? true,
    });
    return toolSuccess(REPLACE_LINES_TOOL_NAME, data);
  } catch (error) {
    const structured = parseFileModifyToolError(error);
    if (structured) {
      return toolFailure(REPLACE_LINES_TOOL_NAME, structured.code, structured.message);
    }

    const message = error instanceof Error ? error.message : String(error);
    return toolFailure(REPLACE_LINES_TOOL_NAME, "execution_failed", message);
  }
};

function parseReplaceLinesArgs(
  rawArgs: unknown
): { ok: true; value: ReplaceLinesArgs } | { ok: false; message: string } {
  if (rawArgs === undefined || rawArgs === null) {
    return { ok: false, message: "path, start_line, end_line, and new_content are required" };
  }

  if (typeof rawArgs !== "object" || Array.isArray(rawArgs)) {
    return { ok: false, message: "Arguments must be a JSON object" };
  }

  const record = rawArgs as Record<string, unknown>;
  const path = record.path;
  const startLine = record.start_line;
  const endLine = record.end_line;
  const newContent = record.new_content;

  if (typeof path !== "string" || path.trim().length === 0) {
    return { ok: false, message: "path is required and must be a non-empty string" };
  }

  if (typeof startLine !== "number" || !Number.isInteger(startLine) || startLine < 1) {
    return { ok: false, message: "start_line is required and must be a positive integer" };
  }

  if (typeof endLine !== "number" || !Number.isInteger(endLine) || endLine < 1) {
    return { ok: false, message: "end_line is required and must be a positive integer" };
  }

  if (startLine > endLine) {
    return { ok: false, message: "start_line must be <= end_line" };
  }

  if (typeof newContent !== "string") {
    return { ok: false, message: "new_content is required and must be a string" };
  }

  const expectedSha256 = record.expected_sha256;
  if (expectedSha256 !== undefined && typeof expectedSha256 !== "string") {
    return { ok: false, message: "expected_sha256 must be a string" };
  }

  const createBackup = record.create_backup;
  if (createBackup !== undefined && typeof createBackup !== "boolean") {
    return { ok: false, message: "create_backup must be a boolean" };
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
      end_line: endLine,
      new_content: newContent,
      expected_sha256: expectedSha256,
      create_backup: createBackup,
      respect_gitignore: respectGitignore,
    },
  };
}

function parseFileModifyToolError(
  error: unknown
): FileModifyToolErrorPayload | null {
  if (typeof error === "string") {
    return parseFileModifyToolErrorPayload(error);
  }

  if (error instanceof Error) {
    const fromMessage = parseFileModifyToolErrorPayload(error.message);
    if (fromMessage) {
      return fromMessage;
    }
  }

  return parseFileModifyToolErrorPayload(error);
}

function parseFileModifyToolErrorPayload(
  raw: unknown
): FileModifyToolErrorPayload | null {
  const parsed =
    typeof raw === "string"
      ? parseJsonFileModifyToolError(raw)
      : isFileModifyToolErrorPayload(raw)
        ? raw
        : null;

  if (!parsed) {
    return null;
  }

  return {
    code: parsed.code,
    message: parsed.message,
    size: parsed.size,
  };
}

function parseJsonFileModifyToolError(
  raw: string
): FileModifyToolErrorPayload | null {
  try {
    const parsed = JSON.parse(raw) as unknown;
    return isFileModifyToolErrorPayload(parsed) ? parsed : null;
  } catch {
    return null;
  }
}

function isFileModifyToolErrorPayload(
  value: unknown
): value is FileModifyToolErrorPayload {
  if (typeof value !== "object" || value === null) {
    return false;
  }

  const record = value as Record<string, unknown>;
  return (
    typeof record.code === "string" && typeof record.message === "string"
  );
}
