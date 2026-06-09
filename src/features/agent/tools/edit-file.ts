import { invoke, isTauri } from "@tauri-apps/api/core";

import { toolFailure, toolSuccess } from "./result";
import { EDIT_FILE_TOOL_NAME } from "./definitions";
import type { FileModifyData, FileModifyToolErrorPayload, ToolHandler } from "./types";

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
  if (!isTauri()) {
    return toolFailure(
      EDIT_FILE_TOOL_NAME,
      "unsupported_runtime",
      "edit_file is only available in the desktop app"
    );
  }

  if (!context.workspaceDir) {
    return toolFailure(
      EDIT_FILE_TOOL_NAME,
      "workspace_required",
      "Select a workspace directory before editing files"
    );
  }

  const args = parseEditFileArgs(rawArgs);
  if (!args.ok) {
    return toolFailure(EDIT_FILE_TOOL_NAME, "invalid_arguments", args.message);
  }

  try {
    const data = await invoke<FileModifyData>("tool_edit_file", {
      workspaceDir: context.workspaceDir,
      path: args.value.path,
      oldString: args.value.old_string,
      newString: args.value.new_string,
      expectedSha256: args.value.expected_sha256,
      replaceAll: args.value.replace_all ?? false,
      createBackup: args.value.create_backup ?? true,
      respectGitignore: args.value.respect_gitignore ?? true,
    });
    return toolSuccess(EDIT_FILE_TOOL_NAME, data);
  } catch (error) {
    const structured = parseFileModifyToolError(error);
    if (structured) {
      return toolFailure(EDIT_FILE_TOOL_NAME, structured.code, structured.message);
    }

    const message = error instanceof Error ? error.message : String(error);
    return toolFailure(EDIT_FILE_TOOL_NAME, "execution_failed", message);
  }
};

function parseEditFileArgs(
  rawArgs: unknown
): { ok: true; value: EditFileArgs } | { ok: false; message: string } {
  if (rawArgs === undefined || rawArgs === null) {
    return { ok: false, message: "path, old_string, and new_string are required" };
  }

  if (typeof rawArgs !== "object" || Array.isArray(rawArgs)) {
    return { ok: false, message: "Arguments must be a JSON object" };
  }

  const record = rawArgs as Record<string, unknown>;
  const path = record.path;
  const oldString = record.old_string;
  const newString = record.new_string;

  if (typeof path !== "string" || path.trim().length === 0) {
    return { ok: false, message: "path is required and must be a non-empty string" };
  }

  if (typeof oldString !== "string") {
    return { ok: false, message: "old_string is required and must be a string" };
  }

  if (typeof newString !== "string") {
    return { ok: false, message: "new_string is required and must be a string" };
  }

  const expectedSha256 = record.expected_sha256;
  if (expectedSha256 !== undefined && typeof expectedSha256 !== "string") {
    return { ok: false, message: "expected_sha256 must be a string" };
  }

  const replaceAll = record.replace_all;
  if (replaceAll !== undefined && typeof replaceAll !== "boolean") {
    return { ok: false, message: "replace_all must be a boolean" };
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
      old_string: oldString,
      new_string: newString,
      expected_sha256: expectedSha256,
      replace_all: replaceAll,
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
