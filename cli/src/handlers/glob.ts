import { readdirSync, statSync } from "node:fs";
import { resolve, relative, sep } from "node:path";
import { toolFailure, toolSuccess } from "./result";
import type { ToolHandler } from "./types";

type GlobArgs = {
  glob_pattern: string;
  target_directory?: string;
  head_limit?: number;
  respect_gitignore?: boolean;
};

/**
 * Simple glob matching — converts glob patterns to regex and walks directories.
 * For complex patterns, the CLI agent can use the shell tool to call the real `find` or `dir` command.
 */
export const globHandler: ToolHandler = async (rawArgs, context) => {
  const args = rawArgs as GlobArgs;

  if (!context.workspaceDir) {
    return toolFailure("glob", "workspace_required", "No workspace directory set");
  }

  const searchDir = args.target_directory
    ? resolve(context.workspaceDir, args.target_directory)
    : context.workspaceDir;

  const headLimit = args.head_limit ?? 100;
  const pattern = args.glob_pattern;

  try {
    const matches = simpleGlob(searchDir, pattern, context.workspaceDir, headLimit);
    return toolSuccess("glob", {
      pattern,
      targetDirectory: relative(context.workspaceDir, searchDir),
      matches: matches.slice(0, headLimit),
      totalMatches: matches.length,
      truncated: matches.length > headLimit,
    });
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    return toolFailure("glob", "search_error", message);
  }
};

function simpleGlob(
  rootDir: string,
  pattern: string,
  workspaceDir: string,
  limit: number,
): string[] {
  const results: string[] = [];

  // Simple recursive walk — for production, use a proper glob library
  function walk(dir: string): void {
    if (results.length >= limit) return;

    let entries: string[];
    try {
      entries = readdirSync(dir);
    } catch {
      return;
    }

    for (const name of entries) {
      if (results.length >= limit) return;
      if (name.startsWith(".")) continue;

      const fullPath = resolve(dir, name);
      const relPath = relative(workspaceDir, fullPath).replace(/\\/g, "/");

      let stats: ReturnType<typeof statSync>;
      try {
        stats = statSync(fullPath);
      } catch {
        continue;
      }

      // Simple glob matching: check if pattern matches the relative path
      const regex = globToRegex(pattern);
      if (regex.test(relPath)) {
        results.push(relPath);
      }

      if (stats.isDirectory()) {
        walk(fullPath);
      }
    }
  }

  walk(rootDir);

  // Sort for consistent output
  results.sort();
  return results;
}

function globToRegex(pattern: string): RegExp {
  let regexStr = "^";
  let i = 0;

  while (i < pattern.length) {
    const ch = pattern[i];
    if (ch === "*") {
      if (i + 1 < pattern.length && pattern[i + 1] === "*") {
        // ** — match everything including path separators
        regexStr += ".*";
        i += 2;
        // Handle **/ pattern
        if (i < pattern.length && pattern[i] === "/") {
          regexStr += "/?";
          i++;
        }
      } else {
        // * — match anything except path separator
        regexStr += "[^/]*";
        i++;
      }
    } else if (ch === "?") {
      regexStr += "[^/]";
      i++;
    } else if (ch === "." || ch === "+" || ch === "(" || ch === ")" || ch === "[" || ch === "]" || ch === "{"
      || ch === "}" || ch === "\\" || ch === "^" || ch === "$" || ch === "|") {
      regexStr += "\\" + ch;
      i++;
    } else {
      regexStr += ch;
      i++;
    }
  }

  regexStr += "$";
  return new RegExp(regexStr, "i");
}
