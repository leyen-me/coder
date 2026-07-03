import { invoke, isTauri } from "@tauri-apps/api/core";

import { toolFailure, toolSuccess } from "./result";
import { REPLACE_FILE_TOOL_NAME } from "./definitions";
import type { FileModifyData, FileModifyToolErrorPayload, ToolHandler } from "./types";

type ReplaceFileArgs = {
  path: string;
  content: string;
  expected_sha256?: string;
  create_backup?: boolean;
  respect_gitignore?: boolean;
};

export const replaceFileHandler: ToolHandler = async (rawArgs, context) => {
  if (!isTauri()) {
    return toolFailure(
      REPLACE_FILE_TOOL_NAME,
      "unsupported_runtime",
      "replace_file is only available in the desktop app"
    );
  }

  if (!context.workspaceDir) {
    return toolFailure(
      REPLACE_FILE_TOOL_NAME,
      "workspace_required",
      "Select a workspace directory before replacing files"
    );
  }

  const args = parseReplaceFileArgs(rawArgs);
  if (!args.ok) {
    return toolFailure(REPLACE_FILE_TOOL_NAME, "invalid_arguments", args.message);
  }

  try {
    const data = await invoke<FileModifyData>("tool_replace_file", {
      workspaceDir: context.workspaceDir,
      path: args.value.path,
      content: args.value.content,
      expectedSha256: args.value.expected_sha256,
      // Default off: .history rollback is not implemented yet (see text_file::create_backup).
      createBackup: args.value.create_backup ?? false,
      respectGitignore: args.value.respect_gitignore ?? true,
    });
    return toolSuccess(REPLACE_FILE_TOOL_NAME, data);
  } catch (error) {
    const structured = parseFileModifyToolError(error);
    if (structured) {
      return toolFailure(
        REPLACE_FILE_TOOL_NAME,
        structured.code,
        structured.message
      );
    }

    const message = error instanceof Error ? error.message : String(error);
    return toolFailure(REPLACE_FILE_TOOL_NAME, "execution_failed", message);
  }
};

function parseReplaceFileArgs(
  rawArgs: unknown
): { ok: true; value: ReplaceFileArgs } | { ok: false; message: string } {
  if (rawArgs === undefined || rawArgs === null) {
    return { ok: false, message: "path and content are required" };
  }

  if (typeof rawArgs !== "object" || Array.isArray(rawArgs)) {
    return { ok: false, message: "Arguments must be a JSON object" };
  }

  const record = rawArgs as Record<string, unknown>;
  const path = record.path;
  const content = record.content;

  if (typeof path !== "string" || path.trim().length === 0) {
    return { ok: false, message: "path is required and must be a non-empty string" };
  }

  if (typeof content !== "string") {
    return { ok: false, message: "content is required and must be a string" };
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
      content,
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
