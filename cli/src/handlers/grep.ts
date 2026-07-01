import { readFileSync, readdirSync, statSync } from "node:fs";
import { resolve, relative } from "node:path";
import { toolFailure, toolSuccess } from "./result";
import type { GrepData, ToolHandler } from "./types";

type GrepArgs = {
  pattern: string;
  path?: string;
  glob?: string;
  output_mode?: "content" | "files_with_matches" | "count";
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
  const args = rawArgs as GrepArgs;

  if (!context.workspaceDir) {
    return toolFailure("grep", "workspace_required", "No workspace directory set");
  }

  const searchPath = args.path
    ? resolve(context.workspaceDir, args.path)
    : context.workspaceDir;

  const headLimit = args.head_limit ?? 200;
  const offset = args.offset ?? 0;
  const ctxBefore = args.context_before ?? args.context ?? 0;
  const ctxAfter = args.context_after ?? args.context ?? 0;
  const flags = args.case_insensitive ? "gi" : "g";
  const outputMode = args.output_mode ?? "content";

  try {
    let searchRegex: RegExp;
    try {
      searchRegex = new RegExp(args.pattern, flags);
    } catch {
      return toolFailure("grep", "invalid_pattern", `Invalid regex pattern: ${args.pattern}`);
    }

    const files = collectFiles(searchPath);
    const matches: NonNullable<GrepData["matches"]> = [];
    const fileMatchSet: Set<string> = new Set();
    let totalMatches = 0;
    let skippedFiles = 0;

    for (const file of files) {
      if (totalMatches >= headLimit + offset) break;

      let content: string;
      try {
        content = readFileSync(file, "utf-8");
      } catch {
        skippedFiles++;
        continue;
      }

      const lines = content.split("\n");
      let fileHasMatch = false;

      for (let lineNum = 0; lineNum < lines.length; lineNum++) {
        if (searchRegex.test(lines[lineNum])) {
          searchRegex.lastIndex = 0;
          totalMatches++;

          if (outputMode === "files_with_matches") {
            fileMatchSet.add(relative(context.workspaceDir, file));
            fileHasMatch = true;
            continue;
          }

          if (outputMode === "count") {
            fileHasMatch = true;
            continue;
          }

          // content mode
          if (totalMatches > offset && totalMatches <= offset + headLimit) {
            const contextBeforeLines = ctxBefore > 0
              ? lines.slice(Math.max(0, lineNum - ctxBefore), lineNum)
              : undefined;
            const contextAfterLines = ctxAfter > 0
              ? lines.slice(lineNum + 1, lineNum + 1 + ctxAfter)
              : undefined;

            matches!.push({
              path: relative(context.workspaceDir, file),
              lineNumber: lineNum + 1,
              line: lines[lineNum],
              contextBefore: contextBeforeLines?.length ? contextBeforeLines : undefined,
              contextAfter: contextAfterLines?.length ? contextAfterLines : undefined,
            });
          }
        }
      }

      if (fileHasMatch && outputMode === "count") {
        fileMatchSet.add(relative(context.workspaceDir, file));
      }

      if (fileHasMatch && outputMode === "files_with_matches" && fileMatchSet.size >= headLimit) {
        break;
      }
    }

    const result: GrepData = {
      pattern: args.pattern,
      path: relative(context.workspaceDir, searchPath),
      outputMode,
      totalMatches,
      truncated: totalMatches > headLimit,
    };

    if (outputMode === "content") {
      result.matches = matches!;
    } else if (outputMode === "files_with_matches") {
      result.files = [...fileMatchSet];
    } else if (outputMode === "count") {
      result.files = [...fileMatchSet];
    }

    if (skippedFiles > 0) {
      result.skippedFiles = skippedFiles;
    }

    return toolSuccess("grep", result);
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    return toolFailure("grep", "search_error", message);
  }
};

function collectFiles(dirPath: string): string[] {
  const results: string[] = [];

  function walk(dir: string): void {
    let entries: string[];
    try {
      entries = readdirSync(dir);
    } catch {
      return;
    }

    for (const name of entries) {
      if (name === ".git" || name === "node_modules") continue;

      const fullPath = resolve(dir, name);
      let stats: ReturnType<typeof statSync>;
      try {
        stats = statSync(fullPath);
      } catch {
        continue;
      }

      if (stats.isDirectory()) {
        walk(fullPath);
      } else if (stats.isFile() && stats.size > 0) {
        results.push(fullPath);
      }
    }
  }

  walk(dirPath);
  return results;
}
