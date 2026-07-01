"use client";

import { extractKillShellData } from "@/features/agent/tools/shell-management-display";
import type { ToolUIPart } from "ai";

import { CollapsibleToolSection } from "@/components/ai-elements/collapsible-tool-section";
import { ToolStatusIcon } from "@/features/chat/components/tool-status-icon";

type KillShellToolOutputProps = {
  output: unknown;
  input: unknown;
  toolName: string;
  state: ToolUIPart["state"];
  errorText?: string;
  className?: string;
  collapsible?: boolean;
};

export function KillShellToolOutput({
  output,
  input,
  toolName,
  state,
  errorText,
  className,
  collapsible,
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
          <span className="shrink-0 text-muted-foreground">·</span>
          <span
            className="min-w-0 truncate font-mono text-muted-foreground"
            title={shellId}
          >
            {shortenedShellId}
          </span>
          {killed ? (
            <span className="shrink-0 ml-auto rounded-full bg-success/10 px-1.5 py-0.5 font-mono text-[10px] font-medium text-success">
              killed
            </span>
          ) : null}
        </>
      }
    >
      {killed ? (
        <div className="px-3 py-2 text-xs text-muted-foreground">
          Process terminated successfully.
        </div>
      ) : null}
    </CollapsibleToolSection>
  );
}
