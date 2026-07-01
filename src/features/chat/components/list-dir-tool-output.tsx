"use client";

import type { ToolUIPart } from "ai";

import {
  CollapsibleToolSection,
} from "@/components/ai-elements/collapsible-tool-section";
import { formatListDirOutputForDisplay } from "@/features/agent/tools/list-dir-display";
import { ToolStatusIcon } from "./tool-status-icon";
import {
  FileIcon,
  FolderIcon,
  FolderOpenIcon,
} from "lucide-react";
import { useMemo } from "react";

type ListDirToolOutputProps = {
  output: unknown;
  input: unknown;
  toolName: string;
  state: ToolUIPart["state"];
  errorText?: string;
  className?: string;
  collapsible?: boolean;
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
  collapsible,
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
    <CollapsibleToolSection
      className={className}
      collapsible={collapsible}
      errorText={isError ? errorText : undefined}
      header={
        <>
          <ToolStatusIcon state={state} />
          <span className="shrink-0 font-mono font-medium text-foreground">
            {toolName}
          </span>
          {formatted ? (
            <>
              <span className="shrink-0 text-muted-foreground">·</span>
              <span className="min-w-0 truncate font-mono text-muted-foreground">
                {formatted.path}
              </span>
              <span className="shrink-0 font-mono text-muted-foreground/60">
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
        </>
      }
    >
      {formatted && (dirs.length > 0 || files.length > 0) ? (
        <div className="max-h-80 overflow-y-auto py-1">
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
      ) : formatted && dirs.length === 0 && files.length === 0 && !isError ? (
        <div className="flex items-center gap-2 px-3 py-4 text-xs text-muted-foreground">
          <FolderIcon className="size-4" />
          <span>Empty directory</span>
        </div>
      ) : null}
    </CollapsibleToolSection>
  );
}
