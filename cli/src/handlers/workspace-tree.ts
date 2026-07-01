import { readdirSync, statSync } from "node:fs";
import { resolve, relative } from "node:path";
import { toolFailure, toolSuccess } from "./result";
import type { ToolHandler } from "./types";

type GetWorkspaceTreeArgs = {
  max_lines?: number;
  start_line?: number;
};

const EXCLUDED_DIRS = new Set([
  "node_modules", ".git", "dist", "build", "target", ".next",
  "out", ".cache", ".turbo", "coverage", ".nyc_output",
  "__pycache__", ".venv", "venv", ".history",
]);

export const getWorkspaceTreeHandler: ToolHandler = async (rawArgs, context) => {
  const args = rawArgs as GetWorkspaceTreeArgs;

  if (!context.workspaceDir) {
    return toolFailure("get_workspace_tree", "workspace_required", "No workspace directory set");
  }

  try {
    const rootDir = context.workspaceDir;
    const treeLines = buildTree(rootDir, rootDir, 0);
    const fullText = treeLines.join("\n");
    const totalLines = treeLines.length;
    const startLine = args.start_line ?? 1;
    const maxLines = args.max_lines ?? 500;
    const endLine = Math.min(startLine + maxLines - 1, totalLines);
    const paginatedText = treeLines.slice(startLine - 1, endLine).join("\n");

    return toolSuccess("get_workspace_tree", {
      treeText: paginatedText,
      totalLines,
      startLine,
      endLine,
      truncated: endLine < totalLines,
    });
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    return toolFailure("get_workspace_tree", "error", message);
  }
};

function buildTree(rootDir: string, currentDir: string, depth: number): string[] {
  const lines: string[] = [];
  const relPath = relative(rootDir, currentDir);

  if (depth === 0) {
    lines.push(relative(rootDir, currentDir) || ".");
  }

  let entries: string[];
  try {
    entries = readdirSync(currentDir);
  } catch {
    return lines;
  }

  // Sort: directories first, then files, alphabetical
  const dirs: string[] = [];
  const files: string[] = [];

  for (const name of entries) {
    if (name.startsWith(".") && depth === 0 && name === ".git") continue;
    if (EXCLUDED_DIRS.has(name)) continue;
    if (name.startsWith(".") && depth > 0) continue;

    const fullPath = resolve(currentDir, name);
    try {
      const stats = statSync(fullPath);
      if (stats.isDirectory()) {
        dirs.push(name);
      } else {
        files.push(name);
      }
    } catch {
      // skip
    }
  }

  dirs.sort();
  files.sort();

  const allEntries = [...dirs, ...files];

  for (let i = 0; i < allEntries.length; i++) {
    const name = allEntries[i];
    const isLast = i === allEntries.length - 1;
    const prefix = depth === 0 ? (isLast ? "└── " : "├── ") : "";
    const childPrefix = depth === 0 ? (isLast ? "    " : "│   ") : "";
    const fullPath = resolve(currentDir, name);

    lines.push(`${prefix}${name}`);

    try {
      const stats = statSync(fullPath);
      if (stats.isDirectory()) {
        const childLines = buildTreeFromDepth(rootDir, fullPath, depth + 1, prefix || "", childPrefix);
        lines.push(...childLines);
      }
    } catch {
      // skip
    }
  }

  return lines;
}

function buildTreeFromDepth(
  rootDir: string,
  currentDir: string,
  depth: number,
  parentPrefix: string,
  prefix: string,
): string[] {
  const lines: string[] = [];

  let entries: string[];
  try {
    entries = readdirSync(currentDir);
  } catch {
    return lines;
  }

  const dirs: string[] = [];
  const files: string[] = [];

  for (const name of entries) {
    if (EXCLUDED_DIRS.has(name)) continue;
    if (name.startsWith(".")) continue;

    const fullPath = resolve(currentDir, name);
    try {
      const stats = statSync(fullPath);
      if (stats.isDirectory()) {
        dirs.push(name);
      } else {
        files.push(name);
      }
    } catch {
      // skip
    }
  }

  dirs.sort();
  files.sort();

  const allEntries = [...dirs, ...files];

  for (let i = 0; i < allEntries.length; i++) {
    const name = allEntries[i];
    const isLast = i === allEntries.length - 1;
    const linePrefix = `${prefix}${isLast ? "└── " : "├── "}`;
    const childPrefix = `${prefix}${isLast ? "    " : "│   "}`;

    lines.push(`${linePrefix}${name}`);

    const fullPath = resolve(currentDir, name);
    try {
      const stats = statSync(fullPath);
      if (stats.isDirectory()) {
        const childLines = buildTreeFromDepth(rootDir, fullPath, depth + 1, "", childPrefix);
        lines.push(...childLines);
      }
    } catch {
      // skip
    }
  }

  return lines;
}
