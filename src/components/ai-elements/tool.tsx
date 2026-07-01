"use client";

import { Badge } from "@/components/ui/badge";
import {
  Collapsible,
  CollapsibleContent,
  CollapsibleTrigger,
} from "@/components/ui/collapsible";
import { cn } from "@/lib/utils";
import type { DynamicToolUIPart, ToolUIPart } from "ai";
import {
  CheckCircleIcon,
  ChevronDownIcon,
  CircleIcon,
  ClockIcon,
  WrenchIcon,
  XCircleIcon,
} from "lucide-react";
import type { ComponentProps, ReactNode } from "react";
import { isValidElement } from "react";

import { CodeBlock } from "./code-block";

export type ToolProps = ComponentProps<typeof Collapsible>;

export const Tool = ({ className, ...props }: ToolProps) => (
  <Collapsible
    className={cn("group not-prose mb-4 w-full rounded-md border", className)}
    {...props}
  />
);

export type ToolPart = ToolUIPart | DynamicToolUIPart;

export type ToolHeaderProps = {
  title?: string;
  className?: string;
} & (
  | { type: ToolUIPart["type"]; state: ToolUIPart["state"]; toolName?: never }
  | {
      type: DynamicToolUIPart["type"];
      state: DynamicToolUIPart["state"];
      toolName: string;
    }
);

const statusLabels: Record<ToolPart["state"], string> = {
  "approval-requested": "Awaiting Approval",
  "approval-responded": "Responded",
  "input-available": "Running",
  "input-streaming": "Pending",
  "output-available": "Completed",
  "output-denied": "Denied",
  "output-error": "Error",
};

const statusIcons: Record<ToolPart["state"], ReactNode> = {
  "approval-requested": <ClockIcon className="size-4 text-yellow-600" />,
  "approval-responded": <CheckCircleIcon className="size-4 text-blue-600" />,
  "input-available": <ClockIcon className="size-4 animate-pulse" />,
  "input-streaming": <CircleIcon className="size-4" />,
  "output-available": <CheckCircleIcon className="size-4 text-green-600" />,
  "output-denied": <XCircleIcon className="size-4 text-orange-600" />,
  "output-error": <XCircleIcon className="size-4 text-red-600" />,
};

export const getStatusBadge = (status: ToolPart["state"]) => (
  <Badge className="gap-1.5 rounded-full text-xs" variant="secondary">
    {statusIcons[status]}
    {statusLabels[status]}
  </Badge>
);

export const ToolHeader = ({
  className,
  title,
  type,
  state,
  toolName,
  ...props
}: ToolHeaderProps) => {
  const derivedName =
    type === "dynamic-tool" ? toolName : type.split("-").slice(1).join("-");

  return (
    <CollapsibleTrigger
      className={cn(
        "flex w-full items-center justify-between gap-4 p-3",
        className
      )}
      {...props}
    >
      <div className="flex items-center gap-2">
        <WrenchIcon className="size-4 text-muted-foreground" />
        <span className="font-medium text-sm">{title ?? derivedName}</span>
        {getStatusBadge(state)}
      </div>
      <ChevronDownIcon className="size-4 text-muted-foreground transition-transform group-data-[state=open]:rotate-180" />
    </CollapsibleTrigger>
  );
};

export type ToolContentProps = ComponentProps<typeof CollapsibleContent>;

export const ToolContent = ({ className, ...props }: ToolContentProps) => (
  <CollapsibleContent
    className={cn(
      "data-[state=closed]:fade-out-0 data-[state=closed]:slide-out-to-top-2 data-[state=open]:slide-in-from-top-2 space-y-4 p-4 text-popover-foreground outline-none data-[state=closed]:animate-out data-[state=open]:animate-in",
      className
    )}
    {...props}
  />
);

export type ToolInputProps = ComponentProps<"div"> & {
  input: ToolPart["input"];
};

const TOOL_OUTPUT_STRING_PREVIEW_CHARS = 8_000;

function truncateDeepStrings(value: unknown, maxLen: number): unknown {
  if (typeof value === "string") {
    if (value.length <= maxLen) {
      return value;
    }

    return `${value.slice(0, maxLen)}\n\n… [${value.length.toLocaleString()} chars total, truncated for preview]`;
  }

  if (Array.isArray(value)) {
    return value.map((item) => truncateDeepStrings(item, maxLen));
  }

  if (typeof value === "object" && value !== null) {
    return Object.fromEntries(
      Object.entries(value).map(([key, item]) => [
        key,
        truncateDeepStrings(item, maxLen),
      ])
    );
  }

  return value;
}

function formatOutputForDisplay(output: ToolPart["output"]): string {
  if (typeof output === "string") {
    return truncateDeepStrings(output, TOOL_OUTPUT_STRING_PREVIEW_CHARS) as string;
  }

  if (typeof output === "object" && output !== null && !isValidElement(output)) {
    return JSON.stringify(
      truncateDeepStrings(output, TOOL_OUTPUT_STRING_PREVIEW_CHARS),
      null,
      2
    );
  }

  return "";
}

function ToolSectionHeader({ label }: { label: string }) {
  return (
    <div className="flex items-center gap-2">
      <h4 className="font-medium text-muted-foreground text-xs uppercase tracking-wide">
        {label}
      </h4>
    </div>
  );
}

export const ToolInput = ({ className, input, ...props }: ToolInputProps) => {
  const code = JSON.stringify(input, null, 2);

  return (
    <div className={cn("space-y-2 overflow-hidden", className)} {...props}>
      <ToolSectionHeader label="Parameters" />
      <CodeBlock code={code} language="json" />
    </div>
  );
};

export type ToolOutputProps = ComponentProps<"div"> & {
  output: ToolPart["output"];
  errorText: ToolPart["errorText"];
};

export const ToolOutput = ({
  className,
  output,
  errorText,
  ...props
}: ToolOutputProps) => {
  if (!(output || errorText)) {
    return null;
  }

  const label = errorText ? "Error" : "Result";

  let content: ReactNode;

  if (typeof output === "object" && output !== null && !isValidElement(output)) {
    content = (
      <CodeBlock
        code={formatOutputForDisplay(output)}
        language="json"
      />
    );
  } else if (typeof output === "string") {
    content = (
      <CodeBlock code={formatOutputForDisplay(output)} language="json" />
    );
  } else if (output) {
    content = <div className="p-4 text-xs">{output as ReactNode}</div>;
  } else {
    content = null;
  }

  return (
    <div className={cn("space-y-2", className)} {...props}>
      <ToolSectionHeader label={label} />
      {errorText ? (
        <div className="rounded-md bg-destructive/10 p-4 text-destructive text-xs">
          {errorText}
        </div>
      ) : null}
      {content}
    </div>
  );
};
