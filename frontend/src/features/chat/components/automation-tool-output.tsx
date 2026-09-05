"use client";

import { useMemo } from "react";

import { CollapsibleToolSection } from "@/components/ai-elements/collapsible-tool-section";
import {
  CREATE_AUTOMATION_TOOL_NAME,
  DELETE_AUTOMATION_TOOL_NAME,
  LIST_AUTOMATIONS_TOOL_NAME,
  UPDATE_AUTOMATION_TOOL_NAME,
} from "@/features/agent/tools/definitions";
import {
  extractAutomationCreateData,
  extractAutomationRecordData,
  extractListAutomationsData,
} from "@/features/agent/tools/automation-display";
import { ToolStatusIcon } from "@/features/chat/components/tool-status-icon";
import type { ToolUIPart } from "ai";
import { CalendarClockIcon } from "lucide-react";

type AutomationToolOutputProps = {
  output: unknown;
  input: unknown;
  toolName: string;
  state: ToolUIPart["state"];
  errorText?: string;
  className?: string;
  collapsible?: boolean;
};

export function AutomationToolOutput({
  output,
  input,
  toolName,
  state,
  errorText,
  className,
  collapsible,
}: AutomationToolOutputProps) {
  switch (toolName) {
    case LIST_AUTOMATIONS_TOOL_NAME:
      return (
        <ListAutomationsView
          className={className}
          collapsible={collapsible}
          errorText={errorText}
          output={output}
          state={state}
          toolName={toolName}
        />
      );
    case CREATE_AUTOMATION_TOOL_NAME:
      return (
        <CreateAutomationView
          className={className}
          collapsible={collapsible}
          errorText={errorText}
          output={output}
          state={state}
          toolName={toolName}
        />
      );
    case UPDATE_AUTOMATION_TOOL_NAME:
      return (
        <AutomationRecordView
          className={className}
          collapsible={collapsible}
          errorText={errorText}
          output={output}
          state={state}
          toolName={toolName}
          title="Automation updated"
        />
      );
    case DELETE_AUTOMATION_TOOL_NAME:
      return (
        <DeleteAutomationView
          className={className}
          collapsible={collapsible}
          errorText={errorText}
          input={input}
          output={output}
          state={state}
          toolName={toolName}
        />
      );
    default:
      return null;
  }
}

function ListAutomationsView({
  className,
  collapsible,
  errorText,
  output,
  state,
  toolName,
}: Omit<AutomationToolOutputProps, "input">) {
  const data = useMemo(() => extractListAutomationsData(output), [output]);
  const isError = state === "output-error" && errorText;

  return (
    <CollapsibleToolSection
      className={className}
      collapsible={collapsible}
      errorText={isError ? errorText : undefined}
      header={
        <>
          <ToolStatusIcon state={state} />
          <CalendarClockIcon className="size-3.5 shrink-0 text-muted-foreground" />
          <span className="shrink-0 font-mono font-medium text-foreground">
            {toolName}
          </span>
          {data ? (
            <span className="shrink-0 text-muted-foreground">
              · {data.automations.length} item
              {data.automations.length !== 1 ? "s" : ""}
            </span>
          ) : null}
        </>
      }
    >
      {data && data.automations.length > 0 ? (
        <div className="space-y-2 p-3">
          {data.automations.map((automation) => (
            <AutomationSummaryCard key={automation.id} automation={automation} />
          ))}
        </div>
      ) : data ? (
        <p className="p-3 text-xs text-muted-foreground">No automations yet.</p>
      ) : null}
    </CollapsibleToolSection>
  );
}

function CreateAutomationView({
  className,
  collapsible,
  errorText,
  output,
  state,
  toolName,
}: Omit<AutomationToolOutputProps, "input">) {
  const data = useMemo(() => extractAutomationCreateData(output), [output]);
  const isError = state === "output-error" && errorText;

  return (
    <CollapsibleToolSection
      className={className}
      collapsible={collapsible}
      errorText={isError ? errorText : undefined}
      header={
        <>
          <ToolStatusIcon state={state} />
          <CalendarClockIcon className="size-3.5 shrink-0 text-muted-foreground" />
          <span className="shrink-0 font-mono font-medium text-foreground">
            {toolName}
          </span>
          {data ? (
            <span className="min-w-0 truncate text-muted-foreground">
              · {data.automation.name}
            </span>
          ) : null}
        </>
      }
    >
      {data ? (
        <div className="space-y-3 p-3">
          <AutomationSummaryCard automation={data.automation} />
          {data.hint ? (
            <p className="rounded-lg border border-amber-500/20 bg-amber-500/5 px-3 py-2 text-xs text-amber-700 dark:text-amber-300">
              {data.hint}
            </p>
          ) : null}
        </div>
      ) : null}
    </CollapsibleToolSection>
  );
}

function AutomationRecordView({
  className,
  collapsible,
  errorText,
  output,
  state,
  toolName,
  title,
}: Omit<AutomationToolOutputProps, "input"> & { title: string }) {
  const automation = useMemo(() => extractAutomationRecordData(output), [output]);
  const isError = state === "output-error" && errorText;

  return (
    <CollapsibleToolSection
      className={className}
      collapsible={collapsible}
      errorText={isError ? errorText : undefined}
      header={
        <>
          <ToolStatusIcon state={state} />
          <CalendarClockIcon className="size-3.5 shrink-0 text-muted-foreground" />
          <span className="shrink-0 font-mono font-medium text-foreground">
            {toolName}
          </span>
          {automation ? (
            <span className="min-w-0 truncate text-muted-foreground">
              · {automation.name}
            </span>
          ) : null}
        </>
      }
    >
      {automation ? (
        <div className="space-y-2 p-3">
          <p className="text-xs font-medium text-foreground">{title}</p>
          <AutomationSummaryCard automation={automation} />
        </div>
      ) : null}
    </CollapsibleToolSection>
  );
}

function DeleteAutomationView({
  className,
  collapsible,
  errorText,
  input,
  output,
  state,
  toolName,
}: AutomationToolOutputProps) {
  const deletedId = useMemo(() => {
    const data = unwrapData(output);
    if (typeof data?.id === "string") {
      return data.id;
    }
    const inputRecord = asRecord(input);
    return typeof inputRecord?.id === "string" ? inputRecord.id : null;
  }, [input, output]);
  const isError = state === "output-error" && errorText;

  return (
    <CollapsibleToolSection
      className={className}
      collapsible={collapsible}
      errorText={isError ? errorText : undefined}
      header={
        <>
          <ToolStatusIcon state={state} />
          <CalendarClockIcon className="size-3.5 shrink-0 text-muted-foreground" />
          <span className="shrink-0 font-mono font-medium text-foreground">
            {toolName}
          </span>
          {deletedId ? (
            <span className="min-w-0 truncate text-muted-foreground">
              · {deletedId}
            </span>
          ) : null}
        </>
      }
    >
      {deletedId ? (
        <p className="p-3 text-xs text-muted-foreground">
          Deleted automation {deletedId}.
        </p>
      ) : null}
    </CollapsibleToolSection>
  );
}

function AutomationSummaryCard({
  automation,
}: {
  automation: {
    id: string;
    name: string;
    description: string;
    cronExpression: string;
    prompt: string;
    enabled: boolean;
    model: string;
  };
}) {
  return (
    <div className="rounded-lg border border-border/60 bg-muted/20 p-3 text-xs">
      <div className="flex items-start justify-between gap-3">
        <div className="min-w-0">
          <p className="font-medium text-foreground">{automation.name}</p>
          {automation.description ? (
            <p className="mt-1 text-muted-foreground">{automation.description}</p>
          ) : null}
        </div>
        <span
          className={
            automation.enabled
              ? "shrink-0 rounded-full bg-success/10 px-2 py-0.5 text-[10px] font-medium text-success"
              : "shrink-0 rounded-full bg-muted px-2 py-0.5 text-[10px] font-medium text-muted-foreground"
          }
        >
          {automation.enabled ? "enabled" : "disabled"}
        </span>
      </div>
      <div className="mt-3 space-y-1 text-muted-foreground">
        <p>
          <span className="font-medium text-foreground/80">ID</span>{" "}
          {automation.id}
        </p>
        <p>
          <span className="font-medium text-foreground/80">Cron</span>{" "}
          {automation.cronExpression}
        </p>
        <p>
          <span className="font-medium text-foreground/80">Model</span>{" "}
          {automation.model}
        </p>
        <p className="whitespace-pre-wrap">
          <span className="font-medium text-foreground/80">Prompt</span>{" "}
          {automation.prompt}
        </p>
      </div>
    </div>
  );
}

function unwrapData(output: unknown): Record<string, unknown> | null {
  const envelope = asRecord(output);
  if (!envelope || envelope.ok !== true) {
    return null;
  }

  const data = envelope.data;
  if (!data || typeof data !== "object") {
    return null;
  }

  return data as Record<string, unknown>;
}

function asRecord(value: unknown): Record<string, unknown> | null {
  if (typeof value === "object" && value !== null && !Array.isArray(value)) {
    return value as Record<string, unknown>;
  }
  return null;
}
