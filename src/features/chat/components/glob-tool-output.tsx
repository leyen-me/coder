"use client";

import { useMemo } from "react";

import { formatGlobOutputForDisplay } from "@/features/agent/tools/glob-display";
import { OPEN_FILE_IN_PREVIEW_EVENT } from "@/features/right-panel/lib/open-file-event";
import { cn } from "@/lib/utils";
import type { ToolUIPart } from "ai";
import {
  CheckCircle2Icon,
  CircleIcon,
  ExternalLinkIcon,
  FileIcon,
  FolderIcon,
  LoaderCircleIcon,
  SearchIcon,
  XCircleIcon,
} from "lucide-react";

type GlobToolOutputProps = {
  output: unknown;
  input: unknown;
  toolName: string;
  state: ToolUIPart["state"];
  errorText?: string;
  className?: string;
};

/** Group matches into a tree-like structure based on directory prefix. */
function groupByDirectory(matches: string[]): Map<string, string[]> {
  const map = new Map<string, string[]>();
  for (const match of matches) {
    const lastSlash = match.lastIndexOf("/");
    const dir = lastSlash >= 0 ? match.slice(0, lastSlash) : ".";
    const existing = map.get(dir);
    if (existing) {
      existing.push(match);
    } else {
      map.set(dir, [match]);
    }
  }
  return map;
}

function inferFileIcon(path: string): string {
  const name = path.split("/").pop() ?? path;
  if (name.startsWith(".")) return "dotfile";
  const ext = name.split(".").pop()?.toLowerCase() ?? "";
  const codeExts = new Set([
    "ts",
    "tsx",
    "js",
    "jsx",
    "rs",
    "py",
    "go",
    "java",
    "c",
    "cpp",
    "css",
    "scss",
    "html",
    "json",
    "md",
    "yaml",
    "yml",
    "toml",
    "xml",
    "sql",
  ]);
  return codeExts.has(ext) ? "code" : "file";
}

export function GlobToolOutput({
  output,
  input: _input,
  toolName,
  state,
  errorText,
  className,
}: GlobToolOutputProps) {
  const formatted = formatGlobOutputForDisplay(output);
  const isError = state === "output-error" && errorText;
  void _input; // Kept for consistent interface with other tool output components.

  const grouped = useMemo(() => {
    if (!formatted?.matches) return [];
    return Array.from(groupByDirectory(formatted.matches).entries()).sort(
      ([a], [b]) => {
        // Root (.) first, then alphabetical
        if (a === ".") return -1;
        if (b === ".") return 1;
        return a.localeCompare(b);
      },
    );
  }, [formatted]);

  return (
    <div className={cn("w-full overflow-hidden rounded-md border", className)}>
      {/* Header bar */}
      <div className="flex flex-wrap items-center gap-x-2 gap-y-1 border-b bg-muted/30 px-3 py-1.5 text-xs">
        <ToolStatusIcon state={state} />
        <span className="font-mono font-medium text-foreground">
          {toolName}
        </span>
        {formatted ? (
          <>
            <span className="text-muted-foreground">·</span>
            <span className="font-mono text-muted-foreground">
              {formatted.pattern.length > 40
                ? `${formatted.pattern.slice(0, 40)}…`
                : formatted.pattern}
            </span>
            <span className="font-mono text-muted-foreground/60">
              {formatted.totalMatches} match
              {formatted.totalMatches !== 1 ? "es" : ""}
            </span>
            {formatted.truncated ? (
              <span className="rounded-full bg-amber-500/10 px-1.5 py-0.5 font-mono text-[10px] font-medium text-amber-600">
                truncated
              </span>
            ) : null}
          </>
        ) : null}
      </div>

      {/* Error banner */}
      {isError ? (
        <div className="flex items-start gap-2 bg-destructive/10 px-3 py-2.5 text-xs text-destructive">
          <span className="min-w-0 flex-1 whitespace-pre-wrap break-words">
            {errorText}
          </span>
        </div>
      ) : null}

      {/* File list grouped by directory */}
      {formatted && grouped.length > 0 ? (
        <div className="max-h-80 divide-y overflow-y-auto">
          {grouped.map(([dirPath, files]) => (
            <div key={dirPath}>
              {/* Directory header */}
              <div className="sticky top-0 flex items-center gap-1.5 bg-muted/50 px-3 py-1.5 text-xs">
                <FolderIcon className="size-3.5 shrink-0 text-muted-foreground" />
                <span className="font-mono font-medium text-foreground">
                  {dirPath === "." ? "/" : dirPath}
                </span>
                <span className="font-mono text-muted-foreground/60">
                  {files.length}
                </span>
              </div>
              {/* Files */}
              <div>
                {files.map((filePath) => {
                  const name = filePath.split("/").pop() ?? filePath;
                  const iconType = inferFileIcon(filePath);
                  return (
                    <div
                      key={filePath}
                      className="group flex items-center gap-2 px-3 py-1 text-xs transition-colors hover:bg-muted/20"
                    >
                      {iconType === "dotfile" ? (
                        <FileIcon className="size-3.5 shrink-0 text-muted-foreground/40" />
                      ) : (
                        <FileIcon className="size-3.5 shrink-0 text-muted-foreground/60" />
                      )}
                      <span className="min-w-0 flex-1 truncate font-mono text-foreground">
                        {name}
                      </span>
                      <button
                        aria-label="Open in preview"
                        className="flex size-4 shrink-0 items-center justify-center text-muted-foreground/30 opacity-0 transition-all hover:text-muted-foreground group-hover:opacity-100"
                        onClick={() => {
                          const displayName =
                            filePath.split("/").pop() ?? filePath;
                          window.dispatchEvent(
                            new CustomEvent(OPEN_FILE_IN_PREVIEW_EVENT, {
                              detail: { path: filePath, name: displayName },
                            }),
                          );
                        }}
                        title="Open file in preview"
                        type="button"
                      >
                        <ExternalLinkIcon className="size-3" />
                      </button>
                    </div>
                  );
                })}
              </div>
            </div>
          ))}
        </div>
      ) : null}

      {/* Empty state */}
      {formatted && formatted.totalMatches === 0 && !isError ? (
        <div className="flex items-center gap-2 px-3 py-4 text-xs text-muted-foreground">
          <SearchIcon className="size-4" />
          <span>No matches found</span>
        </div>
      ) : null}
    </div>
  );
}

function ToolStatusIcon({ state }: { state: ToolUIPart["state"] }) {
  switch (state) {
    case "output-available":
      return (
        <CheckCircle2Icon className="size-3.5 shrink-0 text-green-600" />
      );
    case "output-error":
      return <XCircleIcon className="size-3.5 shrink-0 text-destructive" />;
    case "input-streaming":
    case "input-available":
      return (
        <LoaderCircleIcon className="size-3.5 shrink-0 animate-spin text-muted-foreground" />
      );
    default:
      return <CircleIcon className="size-3.5 shrink-0 text-muted-foreground" />;
  }
}
