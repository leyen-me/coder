"use client";

import { useMemo } from "react";

import { stripAnsi } from "@/lib/strip-ansi";
import { cn } from "@/lib/utils";

import { formatReadShellLogsOutputForDisplay } from "@/features/agent/tools/shell-management-display";
import type { ToolUIPart } from "ai";
import {
  CheckCircle2Icon,
  CircleIcon,
  LoaderCircleIcon,
  XCircleIcon,
} from "lucide-react";

type ReadShellLogsToolOutputProps = {
  output: unknown;
  input: unknown;
  toolName: string;
  state: ToolUIPart["state"];
  errorText?: string;
  className?: string;
};

export function ReadShellLogsToolOutput({
  output,
  input,
  toolName,
  state,
  errorText,
  className,
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
    <div className={cn("w-full overflow-hidden rounded-md border", className)}>
      {/* Header */}
      <div className="flex flex-wrap items-center gap-x-2 gap-y-1 border-b bg-muted/30 px-3 py-1.5 text-xs">
        <ToolStatusIcon state={state} />
        <span className="font-mono font-medium text-foreground">
          {toolName}
        </span>
        <span className="text-muted-foreground">·</span>
        <span
          className="max-w-[160px] truncate font-mono text-muted-foreground"
          title={shellIdDisplay}
        >
          {shellIdDisplay.length > 20
            ? `${shellIdDisplay.slice(0, 20)}…`
            : shellIdDisplay}
        </span>
        <span className="text-muted-foreground">·</span>
        <span className="font-mono text-muted-foreground">[{streamDisplay}]</span>

        {formatted ? (
          <div className="ml-auto flex items-center gap-x-2 font-mono text-muted-foreground">
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
      </div>

      {/* Error */}
      {errorText ? (
        <div className="bg-destructive/10 px-3 py-2.5 text-xs text-destructive">
          {errorText}
        </div>
      ) : null}

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
    </div>
  );
}

function ToolStatusIcon({ state }: { state: ToolUIPart["state"] }) {
  switch (state) {
    case "output-available":
      return <CheckCircle2Icon className="size-3.5 shrink-0 text-green-600" />;
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

function formatBytes(bytes: number): string {
  if (bytes < 1024) return `${bytes}B`;
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)}KB`;
  return `${(bytes / (1024 * 1024)).toFixed(1)}MB`;
}
