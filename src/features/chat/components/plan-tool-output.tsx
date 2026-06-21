"use client";

import {
  extractPlanDeleteData,
  extractPlanFileData,
  extractPlanListData,
  extractPlanReadData,
} from "@/features/agent/tools/plan-display";
import type {
  PlanDeleteResult,
  PlanFileResult,
  PlanListResult,
  PlanReadResult,
} from "@/features/agent/tools/plan-display";
import {
  PLAN_CREATE_TOOL_NAME,
  PLAN_DELETE_TOOL_NAME,
  PLAN_EDIT_TOOL_NAME,
  PLAN_LIST_TOOL_NAME,
  PLAN_READ_TOOL_NAME,
  PLAN_UPDATE_TOOL_NAME,
} from "@/features/agent/tools/definitions";
import { cn } from "@/lib/utils";
import type { ToolUIPart } from "ai";
import {
  CalendarIcon,
  CheckCircle2Icon,
  CircleIcon,
  FileCheckIcon,
  FileCode2Icon,
  FileTextIcon,
  FolderOpenIcon,
  LoaderCircleIcon,
  Trash2Icon,
  XCircleIcon,
} from "lucide-react";

type PlanToolOutputProps = {
  output: unknown;
  input: unknown;
  toolName: string;
  state: ToolUIPart["state"];
  errorText?: string;
  className?: string;
};

/** Tool types whose result is a PlanFileResult (create, update, edit). */
const FILE_RESULT_TOOLS = new Set([
  PLAN_CREATE_TOOL_NAME,
  PLAN_UPDATE_TOOL_NAME,
  PLAN_EDIT_TOOL_NAME,
]);

function formatTimestamp(ms: number): string {
  if (!ms) return "";
  try {
    return new Date(ms).toLocaleString(undefined, {
      month: "short",
      day: "numeric",
      hour: "2-digit",
      minute: "2-digit",
    });
  } catch {
    return String(ms);
  }
}

function formatBytes(bytes: number): string {
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`;
  return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
}

function PlanFileResultView({
  data,
  label,
}: {
  data: PlanFileResult;
  label: string;
}) {
  return (
    <div className="px-3 py-2.5 text-xs">
      <div className="mb-1 flex items-center gap-2">
        <FileCheckIcon className="size-4 text-green-600" />
        <span className="font-medium text-foreground">{label}</span>
      </div>
      <div className="ml-6 space-y-1">
        <div className="font-mono text-muted-foreground">{data.path}</div>
        <div className="flex flex-wrap gap-x-3 gap-y-1 text-muted-foreground/60">
          <span>{data.lines} lines</span>
          <span>{formatBytes(data.bytesWritten)} written</span>
          <span className="font-mono text-[10px]">SHA256: {data.sha256.slice(0, 12)}…</span>
        </div>
      </div>
    </div>
  );
}

function PlanReadResultView({
  data,
}: {
  data: PlanReadResult;
}) {
  return (
    <div className="divide-y">
      <div className="flex items-center gap-2 px-3 py-2 text-xs">
        <FileTextIcon className="size-4 text-muted-foreground" />
        <span className="font-mono font-medium text-foreground">{data.path}</span>
        {data.modifiedAt ? (
          <span className="ml-auto flex items-center gap-1 font-mono text-muted-foreground/60">
            <CalendarIcon className="size-3" />
            {formatTimestamp(data.modifiedAt)}
          </span>
        ) : null}
      </div>
      <div className="max-h-80 overflow-y-auto">
        <pre className="m-0 px-4 py-3 font-mono text-xs leading-relaxed text-foreground">
          <code>{data.content || "(empty plan)"}</code>
        </pre>
      </div>
    </div>
  );
}

function PlanListResultView({
  data,
}: {
  data: PlanListResult;
}) {
  if (data.plans.length === 0) {
    return (
      <div className="flex items-center gap-2 px-3 py-4 text-xs text-muted-foreground">
        <FolderOpenIcon className="size-4" />
        <span>No plans found</span>
      </div>
    );
  }

  return (
    <div className="max-h-80 divide-y overflow-y-auto">
      {data.plans.map((plan) => (
        <div
          key={plan.name}
          className="flex items-center gap-2 px-3 py-2 text-xs transition-colors hover:bg-muted/20"
        >
          <FileCode2Icon className="size-4 shrink-0 text-muted-foreground/60" />
          <span className="font-mono font-medium text-foreground">{plan.name}</span>
          <span className="font-mono text-muted-foreground/50">{formatBytes(plan.bytes)}</span>
          {plan.modifiedAt ? (
            <span className="ml-auto flex items-center gap-1 font-mono text-muted-foreground/50">
              <CalendarIcon className="size-3" />
              {formatTimestamp(plan.modifiedAt)}
            </span>
          ) : null}
        </div>
      ))}
    </div>
  );
}

function PlanDeleteResultView({
  data,
}: {
  data: PlanDeleteResult;
}) {
  return (
    <div className="flex items-center gap-2 px-3 py-2.5 text-xs text-muted-foreground">
      <Trash2Icon className="size-4 text-destructive" />
      <span>
        Deleted plan: <span className="font-mono text-foreground">{data.name}</span>
      </span>
    </div>
  );
}

// ── Header helpers ──────────────────────────────────────────

function FileResultHeader({ data }: { data: PlanFileResult }) {
  return (
    <>
      <span className="text-muted-foreground">·</span>
      <span className="font-mono text-muted-foreground">{data.name}</span>
      <span className="font-mono text-muted-foreground/60">{data.lines} lines</span>
    </>
  );
}

function ReadResultHeader({ data }: { data: PlanReadResult }) {
  return (
    <>
      <span className="text-muted-foreground">·</span>
      <span className="font-mono text-muted-foreground">{data.name}</span>
      <span className="font-mono text-muted-foreground/60">{data.content.length} chars</span>
    </>
  );
}

function ListResultHeader({ data }: { data: PlanListResult }) {
  return (
    <span className="font-mono text-muted-foreground/60">
      {data.plans.length} plan{data.plans.length !== 1 ? "s" : ""}
    </span>
  );
}

function DeleteResultHeader({ data }: { data: PlanDeleteResult }) {
  return (
    <>
      <span className="text-muted-foreground">·</span>
      <span className="font-mono text-muted-foreground">{data.name}</span>
    </>
  );
}

// ── Main component ──────────────────────────────────────────

export function PlanToolOutput({
  output,
  input: _input,
  toolName,
  state,
  errorText,
  className,
}: PlanToolOutputProps) {
  const isError = state === "output-error" && errorText;
  void _input;

  // Pick the single extractor matching this tool type.
  const fileData = FILE_RESULT_TOOLS.has(toolName) ? extractPlanFileData(output) : null;
  const readData = toolName === PLAN_READ_TOOL_NAME ? extractPlanReadData(output) : null;
  const listData = toolName === PLAN_LIST_TOOL_NAME ? extractPlanListData(output) : null;
  const deleteData = toolName === PLAN_DELETE_TOOL_NAME ? extractPlanDeleteData(output) : null;

  return (
    <div className={cn("w-full overflow-hidden rounded-md border", className)}>
      {/* Header bar — single data section only */}
      <div className="flex flex-wrap items-center gap-x-2 gap-y-1 border-b bg-muted/30 px-3 py-1.5 text-xs">
        <ToolStatusIcon state={state} />
        <span className="font-mono font-medium text-foreground">
          {toolName}
        </span>
        {fileData ? <FileResultHeader data={fileData} /> : null}
        {readData ? <ReadResultHeader data={readData} /> : null}
        {listData ? <ListResultHeader data={listData} /> : null}
        {deleteData ? <DeleteResultHeader data={deleteData} /> : null}
      </div>

      {/* Error banner */}
      {isError ? (
        <div className="flex items-start gap-2 bg-destructive/10 px-3 py-2.5 text-xs text-destructive">
          <span className="min-w-0 flex-1 whitespace-pre-wrap break-words">
            {errorText}
          </span>
        </div>
      ) : null}

      {/* Content based on tool type */}
      {!isError ? (
        <>
          {fileData ? (
            <PlanFileResultView
              data={fileData}
              label={
                toolName === PLAN_CREATE_TOOL_NAME ? "Plan created" :
                toolName === PLAN_UPDATE_TOOL_NAME ? "Plan updated" :
                "Plan edited"
              }
            />
          ) : null}
          {readData ? <PlanReadResultView data={readData} /> : null}
          {listData ? <PlanListResultView data={listData} /> : null}
          {deleteData ? <PlanDeleteResultView data={deleteData} /> : null}
        </>
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
