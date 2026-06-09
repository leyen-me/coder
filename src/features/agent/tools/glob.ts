import { invoke, isTauri } from "@tauri-apps/api/core";

import { GLOB_TOOL_NAME } from "./definitions";
import { toolFailure, toolSuccess } from "./result";
import type { GlobData, ToolHandler } from "./types";

type GlobArgs = {
  glob_pattern: string;
  target_directory?: string;
  head_limit?: number;
  respect_gitignore?: boolean;
};

export const globHandler: ToolHandler = async (rawArgs, context) => {
  if (!isTauri()) {
    return toolFailure(
      GLOB_TOOL_NAME,
      "unsupported_runtime",
      "glob is only available in the desktop app"
    );
  }

  if (!context.workspaceDir) {
    return toolFailure(
      GLOB_TOOL_NAME,
      "workspace_required",
      "Select a workspace directory before searching files"
    );
  }

  const args = parseGlobArgs(rawArgs);
  if (!args.ok) {
    return toolFailure(GLOB_TOOL_NAME, "invalid_arguments", args.message);
  }

  try {
    const data = await invoke<GlobData>("tool_glob", {
      workspaceDir: context.workspaceDir,
      globPattern: args.value.glob_pattern,
      targetDirectory: args.value.target_directory,
      headLimit: args.value.head_limit,
      respectGitignore: args.value.respect_gitignore,
    });
    return toolSuccess(GLOB_TOOL_NAME, data);
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    return toolFailure(GLOB_TOOL_NAME, "execution_failed", message);
  }
};

function parseGlobArgs(
  rawArgs: unknown
): { ok: true; value: GlobArgs } | { ok: false; message: string } {
  if (rawArgs === undefined || rawArgs === null) {
    return { ok: false, message: "glob_pattern is required" };
  }

  if (typeof rawArgs !== "object" || Array.isArray(rawArgs)) {
    return { ok: false, message: "Arguments must be a JSON object" };
  }

  const record = rawArgs as Record<string, unknown>;
  const globPattern = record.glob_pattern;

  if (typeof globPattern !== "string" || globPattern.trim().length === 0) {
    return {
      ok: false,
      message: "glob_pattern is required and must be a non-empty string",
    };
  }

  const targetDirectory = record.target_directory;
  if (targetDirectory !== undefined && typeof targetDirectory !== "string") {
    return { ok: false, message: "target_directory must be a string" };
  }

  const headLimit = record.head_limit;
  if (headLimit !== undefined && typeof headLimit !== "number") {
    return { ok: false, message: "head_limit must be a number" };
  }

  const respectGitignore = record.respect_gitignore;
  if (respectGitignore !== undefined && typeof respectGitignore !== "boolean") {
    return { ok: false, message: "respect_gitignore must be a boolean" };
  }

  return {
    ok: true,
    value: {
      glob_pattern: globPattern,
      target_directory: targetDirectory,
      head_limit: headLimit,
      respect_gitignore: respectGitignore,
    },
  };
}
