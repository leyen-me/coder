
import { apiPost } from "@/lib/api/client";
import { GREP_TOOL_NAME } from "./definitions";
import { toolFailure, toolSuccess } from "./result";
import type { GrepData, ToolHandler } from "./types";

type GrepOutputMode = "content" | "files_with_matches" | "count";

type GrepArgs = {
  pattern: string;
  path?: string;
  glob?: string;
  output_mode?: GrepOutputMode;
  case_insensitive?: boolean;
  context_before?: number;
  context_after?: number;
  context?: number;
  head_limit?: number;
  offset?: number;
  multiline?: boolean;
  respect_gitignore?: boolean;
};

export const grepHandler: ToolHandler = async (rawArgs, context) => {

  if (!context.workspaceDir) {
    return toolFailure(
      GREP_TOOL_NAME,
      "workspace_required",
      "Select a workspace directory before searching files"
    );
  }

  const args = parseGrepArgs(rawArgs);
  if (!args.ok) {
    return toolFailure(GREP_TOOL_NAME, "invalid_arguments", args.message);
  }

  try {
    const data = await apiPost<GrepData>("/api/tool_grep", {
      workspaceDir: context.workspaceDir,
      pattern: args.value.pattern,
      path: args.value.path,
      glob: args.value.glob,
      outputMode: args.value.output_mode,
      caseInsensitive: args.value.case_insensitive,
      contextBefore: args.value.context_before,
      contextAfter: args.value.context_after,
      context: args.value.context,
      headLimit: args.value.head_limit,
      offset: args.value.offset,
      multiline: args.value.multiline,
      respectGitignore: args.value.respect_gitignore,
    });
    return toolSuccess(GREP_TOOL_NAME, data);
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    return toolFailure(GREP_TOOL_NAME, "execution_failed", message);
  }
};

function parseGrepArgs(
  rawArgs: unknown
): { ok: true; value: GrepArgs } | { ok: false; message: string } {
  if (rawArgs === undefined || rawArgs === null) {
    return { ok: false, message: "pattern is required" };
  }

  if (typeof rawArgs !== "object" || Array.isArray(rawArgs)) {
    return { ok: false, message: "Arguments must be a JSON object" };
  }

  const record = rawArgs as Record<string, unknown>;
  const pattern = record.pattern;

  if (typeof pattern !== "string" || pattern.trim().length === 0) {
    return {
      ok: false,
      message: "pattern is required and must be a non-empty string",
    };
  }

  const path = record.path;
  if (path !== undefined && typeof path !== "string") {
    return { ok: false, message: "path must be a string" };
  }

  const glob = record.glob;
  if (glob !== undefined && typeof glob !== "string") {
    return { ok: false, message: "glob must be a string" };
  }

  const outputMode = record.output_mode;
  if (outputMode !== undefined) {
    if (typeof outputMode !== "string") {
      return { ok: false, message: "output_mode must be a string" };
    }
    if (!isGrepOutputMode(outputMode)) {
      return {
        ok: false,
        message: "output_mode must be content, files_with_matches, or count",
      };
    }
  }

  const caseInsensitive = record.case_insensitive;
  if (caseInsensitive !== undefined && typeof caseInsensitive !== "boolean") {
    return { ok: false, message: "case_insensitive must be a boolean" };
  }

  const contextBefore = record.context_before;
  if (contextBefore !== undefined && typeof contextBefore !== "number") {
    return { ok: false, message: "context_before must be a number" };
  }

  const contextAfter = record.context_after;
  if (contextAfter !== undefined && typeof contextAfter !== "number") {
    return { ok: false, message: "context_after must be a number" };
  }

  const context = record.context;
  if (context !== undefined && typeof context !== "number") {
    return { ok: false, message: "context must be a number" };
  }

  const headLimit = record.head_limit;
  if (headLimit !== undefined && typeof headLimit !== "number") {
    return { ok: false, message: "head_limit must be a number" };
  }

  const offset = record.offset;
  if (offset !== undefined && typeof offset !== "number") {
    return { ok: false, message: "offset must be a number" };
  }

  const multiline = record.multiline;
  if (multiline !== undefined && typeof multiline !== "boolean") {
    return { ok: false, message: "multiline must be a boolean" };
  }

  const respectGitignore = record.respect_gitignore;
  if (respectGitignore !== undefined && typeof respectGitignore !== "boolean") {
    return { ok: false, message: "respect_gitignore must be a boolean" };
  }

  return {
    ok: true,
    value: {
      pattern,
      path,
      glob,
      output_mode: outputMode as GrepOutputMode | undefined,
      case_insensitive: caseInsensitive,
      context_before: contextBefore,
      context_after: contextAfter,
      context,
      head_limit: headLimit,
      offset,
      multiline,
      respect_gitignore: respectGitignore,
    },
  };
}

function isGrepOutputMode(value: string): value is GrepOutputMode {
  return (
    value === "content" ||
    value === "files_with_matches" ||
    value === "count"
  );
}
