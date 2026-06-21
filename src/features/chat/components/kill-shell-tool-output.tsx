"use client";

import { cn } from "@/lib/utils";

import { extractKillShellData } from "@/features/agent/tools/shell-management-display";
import type { ToolUIPart } from "ai";
import {
  CheckCircle2Icon,
  CircleIcon,
  LoaderCircleIcon,
  XCircleIcon,
} from "lucide-react";

type KillShellToolOutputProps = {
  output: unknown;
  input: unknown;
  toolName: string;
  state: ToolUIPart["state"];
  errorText?: string;
  className?: string;
};

export function KillShellToolOutput({
  output,
  input,
  toolName,
  state,
  errorText,
  className,
}: KillShellToolOutputProps) {
  const data = extractKillShellData(output);
  const inputRecord =
    input && typeof input === "object"
      ? (input as Record<string, unknown>)
      : null;
  const shellId =
    typeof inputRecord?.shell_id === "string" ? inputRecord.shell_id : "";
  const shortenedShellId =
    shellId.length > 20 ? `${shellId.slice(0, 20)}…` : shellId;

  const killed = data?.killed === true;
  const isError = state === "output-error" && errorText;

  return (
    <div className={cn("w-full overflow-hidden rounded-md border", className)}>
      {/* Header bar */}
      <div
        className={cn(
          "flex items-center gap-2 px-3 py-1.5 text-xs",
          killed
            ? "border-b bg-success/5"
            : isError
              ? "border-b bg-destructive/5"
              : "border-b bg-muted/30",
        )}
      >
        {isError ? (
          <XCircleIcon className="size-3.5 shrink-0 text-destructive" />
        ) : killed ? (
          <CheckCircle2Icon className="size-3.5 shrink-0 text-green-600" />
        ) : (
          <ToolStatusIcon state={state} />
        )}
        <span className="font-mono font-medium text-foreground">
          {toolName}
        </span>
        <span className="text-muted-foreground">·</span>
        <span
          className="max-w-[200px] truncate font-mono text-muted-foreground"
          title={shellId}
        >
          {shortenedShellId}
        </span>
        {killed ? (
          <span className="ml-auto rounded-full bg-success/10 px-1.5 py-0.5 font-mono text-[10px] font-medium text-success">
            killed
          </span>
        ) : null}
      </div>

      {/* Error message */}
      {isError ? (
        <div className="bg-destructive/10 px-3 py-2 text-xs text-destructive">
          {errorText}
        </div>
      ) : killed ? (
        <div className="px-3 py-2 text-xs text-muted-foreground">
          Process terminated successfully.
        </div>
      ) : null}
    </div>
  );
}

function ToolStatusIcon({ state }: { state: ToolUIPart["state"] }) {
  switch (state) {
    case "input-streaming":
    case "input-available":
      return (
        <LoaderCircleIcon className="size-3.5 shrink-0 animate-spin text-muted-foreground" />
      );
    default:
      return <CircleIcon className="size-3.5 shrink-0 text-muted-foreground" />;
  }
}
