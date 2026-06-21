"use client";

import {
  CheckCircle2Icon,
  CircleIcon,
  LoaderCircleIcon,
  XCircleIcon,
} from "lucide-react";
import type { ToolUIPart } from "ai";

import { CodeBlock } from "@/components/ai-elements/code-block";
import { extractWorkspaceTreeData } from "@/features/agent/tools/workspace-tree-display";
import { cn } from "@/lib/utils";

type WorkspaceTreeToolOutputProps = {
  output: unknown;
  toolName: string;
  state: ToolUIPart["state"];
  errorText?: string;
  className?: string;
};

export function WorkspaceTreeToolOutput({
  output,
  toolName,
  state,
  errorText,
  className,
}: WorkspaceTreeToolOutputProps) {
  const data = extractWorkspaceTreeData(output);
  const isError = state === "output-error" && errorText;

  return (
    <div className={cn("w-full overflow-hidden rounded-md border", className)}>
      {/* Header bar */}
      <div className="flex flex-wrap items-center gap-x-2 gap-y-1 border-b bg-muted/30 px-3 py-1.5 text-xs">
        <ToolStatusIcon state={state} />
        <span className="font-mono font-medium text-foreground">
          {toolName}
        </span>
        {data ? (
          <>
            <span className="text-muted-foreground">·</span>
            <span className="font-mono text-muted-foreground">
              L{data.startLine}-{data.endLine}
            </span>
            {data.truncated ? (
              <span className="rounded-full bg-amber-500/10 px-1.5 py-0.5 font-mono text-[10px] font-medium text-amber-600">
                truncated
              </span>
            ) : null}
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
      ) : data ? (
        /* Tree content */
        <div className="max-h-96 overflow-y-auto">
          <CodeBlock
            code={data.treeText || "(empty)"}
            language="bash"
            showLineNumbers
          />
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
