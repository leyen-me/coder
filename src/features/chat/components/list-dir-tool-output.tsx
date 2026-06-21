"use client";

import { useMemo } from "react";

import { formatListDirOutputForDisplay } from "@/features/agent/tools/list-dir-display";
import { cn } from "@/lib/utils";
import type { ToolUIPart } from "ai";
import {
  CheckCircle2Icon,
  CircleIcon,
  FileIcon,
  FolderIcon,
  FolderOpenIcon,
  LoaderCircleIcon,
  XCircleIcon,
} from "lucide-react";

type ListDirToolOutputProps = {
  output: unknown;
  input: unknown;
  toolName: string;
  state: ToolUIPart["state"];
  errorText?: string;
  className?: string;
};

function formatSize(bytes: number | undefined): string | null {
  if (bytes == null) return null;
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`;
  return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
}

export function ListDirToolOutput({
  output,
  input: _input,
  toolName,
  state,
  errorText,
  className,
}: ListDirToolOutputProps) {
  const formatted = formatListDirOutputForDisplay(output);
  const isError = state === "output-error" && errorText;
  void _input;

  const { dirs, files } = useMemo(() => {
    if (!formatted) return { dirs: [], files: [] };
    const d: typeof formatted.entries = [];
    const f: typeof formatted.entries = [];
    for (const entry of formatted.entries) {
      if (entry.isDir) {
        d.push(entry);
      } else {
        f.push(entry);
      }
    }
    d.sort((a, b) => a.name.localeCompare(b.name));
    f.sort((a, b) => a.name.localeCompare(b.name));
    return { dirs: d, files: f };
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
              {formatted.path}
            </span>
            <span className="font-mono text-muted-foreground/60">
              {dirs.length} dir
              {dirs.length !== 1 ? "s" : ""}
              {files.length > 0 ? (
                <span className="text-muted-foreground/60">
                  {" "}· {files.length} file
                  {files.length !== 1 ? "s" : ""}
                </span>
              ) : null}
            </span>
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

      {/* Directory listing */}
      {formatted && (dirs.length > 0 || files.length > 0) ? (
        <div className="max-h-80 overflow-y-auto py-1">
          {/* Directories first */}
          {dirs.map((entry) => (
            <div
              key={entry.path}
              className="group flex items-center gap-2 px-3 py-1 text-xs transition-colors hover:bg-muted/20"
            >
              <FolderOpenIcon className="size-3.5 shrink-0 text-blue-500/70" />
              <span className="min-w-0 flex-1 truncate font-mono font-medium text-foreground">
                {entry.name}/
              </span>
              {entry.size != null ? (
                <span className="shrink-0 font-mono text-muted-foreground/50">
                  {formatSize(entry.size)}
                </span>
              ) : null}
            </div>
          ))}

          {/* Files */}
          {files.map((entry) => (
            <div
              key={entry.path}
              className="group flex items-center gap-2 px-3 py-1 text-xs transition-colors hover:bg-muted/20"
            >
              <FileIcon className="size-3.5 shrink-0 text-muted-foreground/50" />
              <span className="min-w-0 flex-1 truncate font-mono text-foreground">
                {entry.name}
              </span>
              {entry.size != null ? (
                <span className="shrink-0 font-mono text-muted-foreground/50">
                  {formatSize(entry.size)}
                </span>
              ) : null}
            </div>
          ))}
        </div>
      ) : null}

      {/* Empty directory */}
      {formatted && dirs.length === 0 && files.length === 0 && !isError ? (
        <div className="flex items-center gap-2 px-3 py-4 text-xs text-muted-foreground">
          <FolderIcon className="size-4" />
          <span>Empty directory</span>
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
