"use client";

import { useMemo } from "react";

import { cn } from "@/lib/utils";

import type { ListShellsEntry } from "@/features/agent/tools/types";
import {
  formatListShellsOutputForDisplay,
  getShellStatusBadgeStyle,
} from "@/features/agent/tools/shell-management-display";
import type { ToolUIPart } from "ai";
import {
  CheckCircle2Icon,
  CircleIcon,
  LoaderCircleIcon,
  XCircleIcon,
} from "lucide-react";

type ListShellsToolOutputProps = {
  output: unknown;
  input: unknown;
  toolName: string;
  state: ToolUIPart["state"];
  errorText?: string;
  className?: string;
};

export function ListShellsToolOutput({
  output,
  input,
  toolName,
  state,
  errorText,
  className,
}: ListShellsToolOutputProps) {
  const formatted = useMemo(
    () => formatListShellsOutputForDisplay(output),
    [output],
  );

  const inputRecord = useMemo(
    () => (input && typeof input === "object" ? (input as Record<string, unknown>) : null),
    [input],
  );

  const title =
    typeof inputRecord?.description === "string"
      ? inputRecord.description
      : toolName;

  return (
    <div className={cn("w-full overflow-hidden rounded-md border", className)}>
      {/* Header */}
      <div className="flex items-center gap-2 border-b bg-muted/30 px-3 py-1.5 text-xs">
        <ToolStatusIcon state={state} />
        <span className="font-mono font-medium text-foreground">{title}</span>
        {formatted ? (
          <>
            <span className="text-muted-foreground">·</span>
            <span className="font-mono text-muted-foreground">
              {formatted.total} shell{formatted.total !== 1 ? "s" : ""}
            </span>
          </>
        ) : null}
      </div>

      {/* Error */}
      {errorText ? (
        <div className="bg-destructive/10 px-3 py-2.5 text-xs text-destructive">
          {errorText}
        </div>
      ) : null}

      {/* Shell list */}
      {formatted && formatted.shells.length > 0 ? (
        <div className="divide-y">
          {formatted.shells.map((shell) => (
            <ShellRow key={shell.shellId} shell={shell} />
          ))}
          {formatted.total > formatted.shells.length ? (
            <div className="px-3 py-1.5 text-xs text-muted-foreground">
              … and {formatted.total - formatted.shells.length} more
            </div>
          ) : null}
        </div>
      ) : formatted && formatted.shells.length === 0 ? (
        <div className="px-3 py-2 text-xs text-muted-foreground">
          No shells found.
        </div>
      ) : null}
    </div>
  );
}

function ShellRow({ shell }: { shell: ListShellsEntry }) {
  const commandPreview =
    shell.command.length > 48
      ? `${shell.command.slice(0, 48)}…`
      : shell.command;

  const duration =
    shell.startedAtMs > 0
      ? formatElapsed(shell.startedAtMs)
      : null;

  return (
    <div className="flex flex-wrap items-center gap-x-2 gap-y-0.5 px-3 py-2 text-xs">
      {/* Status badge */}
      <span
        className={cn(
          "rounded-full px-1.5 py-0.5 font-mono text-[10px] font-medium",
          getShellStatusBadgeStyle(shell.status),
        )}
      >
        {shell.status}
      </span>

      {/* Command preview */}
      <span
        className="max-w-[200px] truncate font-mono font-medium text-foreground"
        title={shell.command}
      >
        {commandPreview}
      </span>

      {/* Shell ID */}
      <span
        className="font-mono text-muted-foreground"
        title={shell.shellId}
      >
        {shell.shellId.length > 12
          ? `${shell.shellId.slice(0, 12)}…`
          : shell.shellId}
      </span>

      <div className="ml-auto flex items-center gap-x-2">
        {/* Duration */}
        {duration ? (
          <span className="font-mono text-muted-foreground">{duration}</span>
        ) : null}

        {/* Exit code */}
        {shell.exitCode != null ? (
          <span
            className={cn(
              "font-mono",
              shell.exitCode === 0 ? "text-success" : "text-destructive",
            )}
          >
            exit {shell.exitCode}
          </span>
        ) : null}
      </div>
    </div>
  );
}

function formatElapsed(startedAtMs: number): string {
  const elapsed = Date.now() - startedAtMs;
  if (elapsed < 1000) return `${elapsed}ms`;
  if (elapsed < 60_000) return `${(elapsed / 1000).toFixed(1)}s`;
  return `${Math.floor(elapsed / 60_000)}m ${Math.floor((elapsed % 60_000) / 1000)}s`;
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
