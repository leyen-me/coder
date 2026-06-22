"use client";

import { useMemo } from "react";


import { ExternalLinkIcon, FileIcon, SearchIcon } from "lucide-react";

import { CollapsibleToolSection } from "@/components/ai-elements/collapsible-tool-section";
import { ToolStatusIcon } from "@/features/chat/components/tool-status-icon";

import { OPEN_FILE_IN_PREVIEW_EVENT } from "@/features/right-panel/lib/open-file-event";
import { formatGrepOutputForDisplay } from "@/features/agent/tools/grep-display";
import type { ToolUIPart } from "ai";

type GrepToolOutputProps = {
  output: unknown;
  input: unknown;
  toolName: string;
  state: ToolUIPart["state"];
  errorText?: string;
  className?: string;
};

export function GrepToolOutput({
  output,
  input,
  toolName,
  state,
  errorText,
  className,
}: GrepToolOutputProps) {
  const formatted = formatGrepOutputForDisplay(output);
  const pattern = formatted?.pattern ?? extractPatternFromInput(input);
  const isError = state === "output-error" && errorText;

  // Group matches by file path
  const groupedMatches = useMemo(() => {
    if (!formatted?.matches) return [];
    const map = new Map<string, typeof formatted.matches>();
    for (const match of formatted.matches) {
      const existing = map.get(match.path);
      if (existing) {
        existing.push(match);
      } else {
        map.set(match.path, [match]);
      }
    }
    return Array.from(map.entries()).sort(([a], [b]) =>
      a.localeCompare(b),
    );
  }, [formatted]);

  return (
    <CollapsibleToolSection
      className={className}
      errorText={isError ? errorText : undefined}
      header={
        <>
          <ToolStatusIcon state={state} />
          <span className="shrink-0 font-mono font-medium text-foreground">
            {toolName}
          </span>
          <span className="shrink-0 text-muted-foreground">·</span>
          <span className="min-w-0 truncate font-mono text-muted-foreground">
            /{pattern}/
          </span>
          {formatted ? (
            <>
              <span className="shrink-0 font-mono text-muted-foreground/60">
                {formatted.totalMatches} match
                {formatted.totalMatches !== 1 ? "es" : ""}
              </span>
              {formatted.outputMode !== "content" ? (
                <span className="shrink-0 rounded-full bg-muted-foreground/10 px-1.5 py-0.5 font-mono text-[10px] font-medium text-muted-foreground">
                  {formatted.outputMode}
                </span>
              ) : null}
              {formatted.skippedFiles != null && formatted.skippedFiles > 0 ? (
                <span className="shrink-0 rounded-full bg-amber-500/10 px-1.5 py-0.5 font-mono text-[10px] font-medium text-amber-600">
                  {formatted.skippedFiles} skipped
                </span>
              ) : null}
              {formatted.truncated ? (
                <span className="shrink-0 rounded-full bg-amber-500/10 px-1.5 py-0.5 font-mono text-[10px] font-medium text-amber-600">
                  truncated
                </span>
              ) : null}
            </>
          ) : null}
        </>
      }
    >
      {/* Content: files_with_matches mode */}
      {formatted && formatted.outputMode === "files_with_matches" && formatted.files.length > 0 ? (
        <div className="divide-y">
          {formatted.files.map((file) => (
            <div
              key={file}
              className="flex items-center gap-2 px-3 py-2 text-xs hover:bg-muted/30"
            >
              <FileIcon className="size-3.5 shrink-0 text-muted-foreground" />
              <span className="font-mono text-foreground">{file}</span>
              <button
                aria-label="Open in preview"
                className="ml-auto flex size-4 items-center justify-center text-muted-foreground/50 transition-colors hover:text-muted-foreground"
                onClick={() => {
                  const name = file.split("/").pop() ?? file;
                  window.dispatchEvent(
                    new CustomEvent(OPEN_FILE_IN_PREVIEW_EVENT, {
                      detail: { path: file, name },
                    }),
                  );
                }}
                title="Open file in preview"
                type="button"
              >
                <ExternalLinkIcon className="size-3" />
              </button>
            </div>
          ))}
        </div>
      ) : null}

      {/* Content: count mode */}
      {formatted && formatted.outputMode === "count" && formatted.counts.length > 0 ? (
        <div className="divide-y">
          {formatted.counts.map((c) => (
            <div
              key={c.path}
              className="flex items-center gap-2 px-3 py-2 text-xs hover:bg-muted/30"
            >
              <FileIcon className="size-3.5 shrink-0 text-muted-foreground" />
              <span className="font-mono text-foreground">{c.path}</span>
              <span className="ml-auto font-mono font-medium text-muted-foreground">
                {c.count} match{c.count !== 1 ? "es" : ""}
              </span>
            </div>
          ))}
        </div>
      ) : null}

      {/* Content: content mode — grouped by file */}
      {formatted && formatted.outputMode === "content" && groupedMatches.length > 0 ? (
        <div className="max-h-96 divide-y overflow-y-auto">
          {groupedMatches.map(([filePath, matches]) => (
            <div key={filePath}>
              {/* File header */}
              <div className="sticky top-0 flex items-center gap-2 bg-muted/50 px-3 py-1.5 text-xs">
                <FileIcon className="size-3.5 shrink-0 text-muted-foreground" />
                <span className="font-mono font-medium text-foreground">
                  {filePath}
                </span>
                <span className="font-mono text-muted-foreground/60">
                  {matches.length} match
                  {matches.length !== 1 ? "es" : ""}
                </span>
                <button
                  aria-label="Open in preview"
                  className="ml-auto flex size-4 items-center justify-center text-muted-foreground/50 transition-colors hover:text-muted-foreground"
                  onClick={() => {
                    const name = filePath.split("/").pop() ?? filePath;
                    window.dispatchEvent(
                      new CustomEvent(OPEN_FILE_IN_PREVIEW_EVENT, {
                        detail: { path: filePath, name },
                      }),
                    );
                  }}
                  title="Open file in preview"
                  type="button"
                >
                  <ExternalLinkIcon className="size-3" />
                </button>
              </div>
              {/* Match lines */}
              <div className="font-mono text-xs leading-relaxed">
                {matches.map((match, idx) => (
                  <div key={idx}>
                    {/* Context before */}
                    {match.contextBefore?.map((ctx, ci) => (
                      <div
                        key={`ctx-before-${ci}`}
                        className="flex border-t border-border/30 text-muted-foreground/60"
                      >
                        <span className="min-w-[4rem] shrink-0 select-none border-r bg-muted/20 px-2 py-0.5 text-right text-muted-foreground/40">
                          {match.lineNumber - (match.contextBefore?.length ?? 0) + ci}
                        </span>
                        <span className="min-w-0 flex-1 truncate px-2 py-0.5 text-muted-foreground/60">
                          {ctx}
                        </span>
                      </div>
                    ))}
                    {/* The matching line */}
                    <div className="flex border-t border-border/40 bg-primary/5">
                      <span className="min-w-[4rem] shrink-0 select-none border-r bg-muted/30 px-2 py-0.5 text-right font-medium text-foreground">
                        {match.lineNumber}
                      </span>
                      <span className="min-w-0 flex-1 truncate px-2 py-0.5 font-medium text-foreground">
                        {match.line}
                      </span>
                    </div>
                    {/* Context after */}
                    {match.contextAfter?.map((ctx, ci) => (
                      <div
                        key={`ctx-after-${ci}`}
                        className="flex border-t border-border/30 text-muted-foreground/60"
                      >
                        <span className="min-w-[4rem] shrink-0 select-none border-r bg-muted/20 px-2 py-0.5 text-right text-muted-foreground/40">
                          {match.lineNumber + ci + 1}
                        </span>
                        <span className="min-w-0 flex-1 truncate px-2 py-0.5 text-muted-foreground/60">
                          {ctx}
                        </span>
                      </div>
                    ))}
                  </div>
                ))}
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
    </CollapsibleToolSection>
  );
}

function extractPatternFromInput(input: unknown): string {
  if (!input || typeof input !== "object") return "";
  const record = input as Record<string, unknown>;
  return typeof record.pattern === "string" ? record.pattern : "";
}
