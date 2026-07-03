"use client";

import { useMemo } from "react";

import { stripAnsi } from "@/lib/strip-ansi";

import { formatReadShellLogsOutputForDisplay } from "@/features/agent/tools/shell-management-display";
import type { ToolUIPart } from "ai";

import { CollapsibleToolSection } from "@/components/ai-elements/collapsible-tool-section";
import { ToolStatusIcon } from "@/features/chat/components/tool-status-icon";

type ReadShellLogsToolOutputProps = {
  output: unknown;
  input: unknown;
  toolName: string;
  state: ToolUIPart["state"];
  errorText?: string;
  className?: string;
  collapsible?: boolean;
};

export function ReadShellLogsToolOutput({
  output,
  input,
  toolName,
  state,
  errorText,
  className,
  collapsible,
}: ReadShellLogsToolOutputProps) {
  const formatted = useMemo(
    () => formatReadShellLogsOutputForDisplay(output),
    [output],
  );

  const inputRecord = useMemo(
    () =>
      input && typeof input === "object"
        ? (input as Record<string, unknown>)
        : null,
    [input],
  );

  const shellIdDisplay =
    formatted?.shellId ??
    (typeof inputRecord?.shell_id === "string" ? inputRecord.shell_id : "");
  const streamDisplay =
    formatted?.stream ??
    (typeof inputRecord?.stream === "string" ? inputRecord.stream : "stdout");

  const logContent = formatted?.data ?? "";
  const cleanedContent = useMemo(
    () => stripAnsi(logContent),
    [logContent],
  );

  const hasContent = cleanedContent.length > 0 || formatted;

  return (
    <CollapsibleToolSection
      className={className}
      collapsible={collapsible}
      errorText={errorText}
      header={
        <>
          <ToolStatusIcon state={state} />
          <span className="shrink-0 font-mono font-medium text-foreground">
            {toolName}
          </span>
          <span className="shrink-0 text-muted-foreground">·</span>
          <span
            className="min-w-0 truncate font-mono text-muted-foreground"
            title={shellIdDisplay}
          >
            {shellIdDisplay.length > 20
              ? `${shellIdDisplay.slice(0, 20)}…`
              : shellIdDisplay}
          </span>
          <span className="shrink-0 text-muted-foreground">·</span>
          <span className="shrink-0 font-mono text-muted-foreground">[{streamDisplay}]</span>

          {formatted ? (
            <div className="shrink-0 ml-auto flex items-center gap-x-2 font-mono text-muted-foreground">
              <span>offset {formatted.offset}</span>
              <span>/</span>
              <span>{formatBytes(formatted.totalBytes)}</span>
              {formatted.truncated ? (
                <>
                  <span>/</span>
                  <span className="text-warning">truncated</span>
                </>
              ) : null}
            </div>
          ) : null}
        </>
      }
    >
      {/* Log content */}
      {hasContent && !errorText ? (
        <div className="max-h-80 overflow-y-auto">
          {cleanedContent ? (
            <pre className="m-0 px-4 py-3 font-mono text-sm leading-relaxed text-foreground">
              <code>{cleanedContent}</code>
            </pre>
          ) : (
            <div className="px-3 py-2 font-mono text-xs text-muted-foreground">
              (empty output)
            </div>
          )}
          {formatted?.truncated ? (
            <p className="border-t px-3 py-1.5 text-xs text-muted-foreground">
              Log output truncated ({formatBytes(formatted.totalBytes)} total)
            </p>
          ) : null}
        </div>
      ) : !errorText ? (
        <div className="px-3 py-2 font-mono text-xs text-muted-foreground">
          {state === "input-streaming" || state === "input-available"
            ? "Reading logs…"
            : "No log output"}
        </div>
      ) : null}
    </CollapsibleToolSection>
  );
}

function formatBytes(bytes: number): string {
  if (bytes < 1024) return `${bytes}B`;
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)}KB`;
  return `${(bytes / (1024 * 1024)).toFixed(1)}MB`;
}
