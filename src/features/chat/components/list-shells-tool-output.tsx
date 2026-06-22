"use client";

import { useMemo } from "react";

import { cn } from "@/lib/utils";

import type { ListShellsEntry } from "@/features/agent/tools/types";
import {
  formatListShellsOutputForDisplay,
  getShellStatusBadgeStyle,
} from "@/features/agent/tools/shell-management-display";
import type { ToolUIPart } from "ai";

import { CollapsibleToolSection } from "@/components/ai-elements/collapsible-tool-section";
import { ToolStatusIcon } from "@/features/chat/components/tool-status-icon";

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
    <CollapsibleToolSection
      className={className}
      errorText={errorText}
      header={
        <>
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
        </>
      }
    >
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
    </CollapsibleToolSection>
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
