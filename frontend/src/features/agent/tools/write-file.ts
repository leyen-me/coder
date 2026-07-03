
import { toolFailure, toolSuccess } from "./result";
import { WRITE_FILE_TOOL_NAME } from "./definitions";
import type { ToolHandler, WriteFileData, WriteFileToolErrorPayload } from "./types";

type WriteFileArgs = {
  path: string;
  content: string;
  create_parent_dirs?: boolean;
};

export const writeFileHandler: ToolHandler = async (rawArgs, context) => {

  if (!context.workspaceDir) {
    return toolFailure(
      WRITE_FILE_TOOL_NAME,
      "workspace_required",
      "Select a workspace directory before writing files"
    );
  }

  const args = parseWriteFileArgs(rawArgs);
  if (!args.ok) {
    return toolFailure(WRITE_FILE_TOOL_NAME, "invalid_arguments", args.message);
  }

  try {
    const data = await invoke<WriteFileData>("tool_write_file", {
      workspaceDir: context.workspaceDir,
      path: args.value.path,
      content: args.value.content,
      createParentDirs: args.value.create_parent_dirs ?? true,
    });
    return toolSuccess(WRITE_FILE_TOOL_NAME, data);
  } catch (error) {
    const structured = parseWriteFileToolError(error);
    if (structured) {
      return toolFailure(
        WRITE_FILE_TOOL_NAME,
        structured.code,
        structured.message
      );
    }

    const message = error instanceof Error ? error.message : String(error);
    return toolFailure(WRITE_FILE_TOOL_NAME, "execution_failed", message);
  }
};

function parseWriteFileArgs(
  rawArgs: unknown
): { ok: true; value: WriteFileArgs } | { ok: false; message: string } {
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

  const createParentDirs = record.create_parent_dirs;
  if (createParentDirs !== undefined && typeof createParentDirs !== "boolean") {
    return { ok: false, message: "create_parent_dirs must be a boolean" };
  }

  return {
    ok: true,
    value: {
      path,
      content,
      create_parent_dirs: createParentDirs,
    },
  };
}

function parseWriteFileToolError(
  error: unknown
): WriteFileToolErrorPayload | null {
  if (typeof error === "string") {
    return parseWriteFileToolErrorPayload(error);
  }

  if (error instanceof Error) {
    const fromMessage = parseWriteFileToolErrorPayload(error.message);
    if (fromMessage) {
      return fromMessage;
    }
  }

  return parseWriteFileToolErrorPayload(error);
}

function parseWriteFileToolErrorPayload(
  raw: unknown
): WriteFileToolErrorPayload | null {
  const parsed =
    typeof raw === "string"
      ? parseJsonWriteFileToolError(raw)
      : isWriteFileToolErrorPayload(raw)
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

function parseJsonWriteFileToolError(
  raw: string
): WriteFileToolErrorPayload | null {
  try {
    const parsed = JSON.parse(raw) as unknown;
    return isWriteFileToolErrorPayload(parsed) ? parsed : null;
  } catch {
    return null;
  }
}

function isWriteFileToolErrorPayload(
  value: unknown
): value is WriteFileToolErrorPayload {
  if (typeof value !== "object" || value === null) {
    return false;
  }

  const record = value as Record<string, unknown>;
  return (
    typeof record.code === "string" && typeof record.message === "string"
  );
}
