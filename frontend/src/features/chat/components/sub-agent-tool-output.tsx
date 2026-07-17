"use client";

import {
  ChevronDownIcon,
  ChevronRightIcon,
  LoaderCircleIcon,
  XCircleIcon,
} from "lucide-react";
import { useState } from "react";

import { extractSubAgentOutput } from "@/features/agent/tools/spawn-subagent-display";

import {
  Collapsible,
  CollapsibleContent,
  CollapsibleTrigger,
} from "@/components/ui/collapsible";

import type { SubAgentStep } from "@/features/agent/tools/types";

type SubAgentToolOutputProps = {
  input: unknown;
  output: unknown;
  errorText?: string;
};

export function SubAgentToolOutput({
  input,
  output,
  errorText,
}: SubAgentToolOutputProps) {
  const data = extractSubAgentOutput(output);
  const [collapsed, setCollapsed] = useState(false);

  if (!data && !errorText) {
    return null;
  }

  if (!data) {
    // Error state — show minimal error card
    return (
      <div className="not-prose my-2 rounded-md border border-destructive/50 bg-destructive/5 p-3 text-sm text-destructive">
        <div className="flex items-center gap-2">
          <XCircleIcon className="size-4 shrink-0" />
          <span className="font-medium">Sub-agent error</span>
        </div>
        {errorText ? (
          <p className="mt-1 text-xs text-muted-foreground">{errorText}</p>
        ) : null}
      </div>
    );
  }

  const inputRecord =
    typeof input === "object" && input !== null
      ? (input as Record<string, unknown>)
      : {};
  const taskLabel =
    typeof inputRecord.task === "string"
      ? inputRecord.task.trim()
      : data.task;

  return (
    <div className="not-prose my-2 w-full">
      <Collapsible
        open={!collapsed}
        onOpenChange={(open) => setCollapsed(!open)}
        className="rounded-md border border-border/70 bg-muted/30"
      >
        {/* Header — single line with truncation, clickable to toggle */}
        <CollapsibleTrigger asChild>
          <div className="flex cursor-pointer select-none items-center gap-2 px-3 pb-2 pt-3 text-xs font-medium text-foreground">
            {collapsed ? (
              <ChevronRightIcon className="size-3.5 shrink-0 text-muted-foreground" />
            ) : (
              <ChevronDownIcon className="size-3.5 shrink-0 text-muted-foreground" />
            )}
            <span className="shrink-0 rounded bg-primary/10 px-1.5 py-0.5 text-[11px] text-primary">
              sub-agent
            </span>
            <span className="min-w-0 truncate">{taskLabel}</span>
            {data.error ? (
              <span className="ml-auto shrink-0 text-destructive">Failed</span>
            ) : (
              <span className="ml-auto shrink-0 text-muted-foreground">
                {data.steps.length} step{data.steps.length !== 1 ? "s" : ""}
              </span>
            )}
          </div>
        </CollapsibleTrigger>

        <CollapsibleContent className="data-[slot=collapsible-content]:overflow-visible">
          <div className="space-y-1 px-3 pb-3">
            {data.steps.length === 0 && !data.error ? (
              <div className="py-2 text-xs text-muted-foreground">
                No steps recorded.
              </div>
            ) : null}
            {data.steps.map((step, index) => (
              <TimelineStep key={index} step={step} />
            ))}

            {/* Summary Card */}
            {data.summary || data.error ? (
              <div className="mt-3 rounded-sm border border-border/50 bg-background/50 p-2 text-xs text-foreground/80">
                <span className="font-medium text-foreground">Summary: </span>
                {data.error ? (
                  <span className="text-destructive">{data.error}</span>
                ) : (
                  data.summary
                )}
              </div>
            ) : null}
          </div>
        </CollapsibleContent>
      </Collapsible>
    </div>
  );
}

function TimelineStep({ step }: { step: SubAgentStep }) {
  if (step.kind === "reasoning") {
    const text = step.text.trim();
    if (!text) {
      return null;
    }
    return (
      <div className="flex items-start gap-2 py-0.5">
        <span className="mt-0.5 shrink-0 text-xs text-muted-foreground">
          💭
        </span>
        <span className="line-clamp-2 text-xs text-muted-foreground">
          {text}
        </span>
      </div>
    );
  }

  // Tool step
  const icon = getToolIcon(step.toolName);
  const stateIcon = getStateIcon(step.state);

  return (
    <div className="flex items-center gap-2 py-0.5">
      <span className="shrink-0 text-xs">{stateIcon ?? icon}</span>
      <span className="min-w-0 truncate text-xs font-medium text-foreground">
        {step.toolName}
      </span>
      {step.toolLabel ? (
        <span className="min-w-0 shrink truncate text-xs text-muted-foreground">
          {step.toolLabel}
        </span>
      ) : null}
      {step.state === "running" ? (
        <LoaderCircleIcon className="ml-auto size-3 shrink-0 animate-spin text-muted-foreground" />
      ) : null}
    </div>
  );
}

function getToolIcon(toolName?: string): string {
  switch (toolName) {
    case "grep":
      return "🔍";
    case "read_file":
      return "📖";
    case "edit_file":
    case "replace_file":
    case "create_file":
    case "write_file":
      return "✏️";
    case "shell":
    case "await":
      return "💻";
    case "web_search":
      return "🌐";
    case "browse_page":
      return "🌍";
    case "glob":
      return "🔎";
    case "list_dir":
      return "📁";
    case "spawn_subagent":
      return "🤖";
    default:
      return "🔧";
  }
}

function getStateIcon(state?: string): string | null {
  switch (state) {
    case "completed":
      return "✅";
    case "error":
      return "❌";
    default:
      return null;
  }
}
