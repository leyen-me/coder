"use client";


import { ExternalLinkIcon, GlobeIcon, SearchIcon, SparklesIcon } from "lucide-react";

import { CollapsibleToolSection } from "@/components/ai-elements/collapsible-tool-section";
import { ToolStatusIcon } from "@/features/chat/components/tool-status-icon";

import { formatWebSearchOutputForDisplay } from "@/features/agent/tools/web-search-display";
import type { ToolUIPart } from "ai";

type WebSearchToolOutputProps = {
  output: unknown;
  input: unknown;
  toolName: string;
  state: ToolUIPart["state"];
  errorText?: string;
  className?: string;
};

function extractDomain(url: string): string {
  try {
    const u = new URL(url);
    return u.hostname.replace(/^www\./, "");
  } catch {
    return url;
  }
}

export function WebSearchToolOutput({
  output,
  input: _input,
  toolName,
  state,
  errorText,
  className,
}: WebSearchToolOutputProps) {
  const formatted = formatWebSearchOutputForDisplay(output);
  const isError = state === "output-error" && errorText;
  void _input; // Kept for consistent interface with other tool output components.

  return (
    <CollapsibleToolSection
      className={className}
      errorText={isError ? errorText : undefined}
      header={
        <>
          <ToolStatusIcon state={state} />
          <span className="font-mono font-medium text-foreground">
            {toolName}
          </span>
          {formatted ? (
            <>
              <span className="text-muted-foreground">·</span>
              <span className="font-mono text-muted-foreground">
                {formatted.query.length > 48
                  ? `${formatted.query.slice(0, 48)}…`
                  : formatted.query}
              </span>
              <span className="font-mono text-muted-foreground/60">
                {formatted.results.length} result
                {formatted.results.length !== 1 ? "s" : ""}
              </span>
            </>
          ) : null}
        </>
      }
    >
      {/* AI-generated answer */}
      {formatted?.answer ? (
        <div className="border-b bg-primary/5 px-3 py-2.5">
          <div className="mb-1 flex items-center gap-1.5 text-xs text-muted-foreground">
            <SparklesIcon className="size-3.5" />
            <span className="font-medium">AI Answer</span>
          </div>
          <p className="text-sm leading-relaxed text-foreground">
            {formatted.answer}
          </p>
        </div>
      ) : null}

      {/* Search results */}
      {formatted && formatted.results.length > 0 ? (
        <div className="divide-y">
          {formatted.results.map((result, idx) => (
            <div
              key={idx}
              className="flex flex-col gap-1 px-3 py-2.5 transition-colors hover:bg-muted/30"
            >
              {/* Title row */}
              <div className="flex items-start gap-2">
                <span className="mt-0.5 min-w-[1.25rem] font-mono text-xs text-muted-foreground/50">
                  {idx + 1}
                </span>
                <div className="min-w-0 flex-1">
                  <a
                    className="text-sm font-medium text-primary underline-offset-2 hover:underline"
                    href={result.url}
                    rel="noopener noreferrer"
                    target="_blank"
                  >
                    {result.title || result.url}
                  </a>
                </div>
                <a
                  aria-label="Open link"
                  className="mt-0.5 flex size-4 shrink-0 items-center justify-center text-muted-foreground/50 transition-colors hover:text-muted-foreground"
                  href={result.url}
                  rel="noopener noreferrer"
                  target="_blank"
                  title="Open link"
                >
                  <ExternalLinkIcon className="size-3" />
                </a>
              </div>
              {/* URL domain */}
              <div className="flex items-center gap-1 pl-[1.85rem]">
                <GlobeIcon className="size-3 text-muted-foreground/40" />
                <span className="font-mono text-xs text-muted-foreground/60">
                  {extractDomain(result.url)}
                </span>
              </div>
              {/* Snippet */}
              {result.snippet ? (
                <p className="line-clamp-2 pl-[1.85rem] text-xs leading-relaxed text-muted-foreground">
                  {result.snippet}
                </p>
              ) : null}
            </div>
          ))}
        </div>
      ) : null}

      {/* Empty / no results state */}
      {formatted && formatted.results.length === 0 && !isError ? (
        <div className="flex items-center gap-2 px-3 py-4 text-xs text-muted-foreground">
          <SearchIcon className="size-4" />
          <span>No results found</span>
        </div>
      ) : null}
    </CollapsibleToolSection>
  );
}
