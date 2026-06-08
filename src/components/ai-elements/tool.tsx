"use client";

import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import {
  Collapsible,
  CollapsibleContent,
  CollapsibleTrigger,
} from "@/components/ui/collapsible";
import { cn } from "@/lib/utils";
import type { DynamicToolUIPart, ToolUIPart } from "ai";
import {
  CheckCircleIcon,
  CheckIcon,
  ChevronDownIcon,
  CircleIcon,
  ClockIcon,
  CopyIcon,
  WrenchIcon,
  XCircleIcon,
} from "lucide-react";
import type { ComponentProps, ReactNode } from "react";
import { isValidElement, useCallback, useEffect, useRef, useState } from "react";

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

function serializeToolOutput(
  output: ToolPart["output"],
  errorText?: ToolPart["errorText"]
): string {
  const parts: string[] = [];

  if (errorText) {
    parts.push(errorText);
  }

  if (output !== undefined && output !== null && output !== "") {
    if (typeof output === "string") {
      parts.push(output);
    } else if (!isValidElement(output)) {
      parts.push(JSON.stringify(output, null, 2));
    }
  }

  return parts.join("\n\n");
}

function CopyButton({ text }: { text: string }) {
  const [isCopied, setIsCopied] = useState(false);
  const timeoutRef = useRef<number>(0);

  const handleCopy = useCallback(async () => {
    if (typeof window === "undefined" || !navigator?.clipboard?.writeText) {
      return;
    }

    try {
      await navigator.clipboard.writeText(text);
      setIsCopied(true);
      timeoutRef.current = window.setTimeout(() => setIsCopied(false), 2000);
    } catch {
      // Ignore clipboard failures.
    }
  }, [text]);

  useEffect(
    () => () => {
      window.clearTimeout(timeoutRef.current);
    },
    []
  );

  const Icon = isCopied ? CheckIcon : CopyIcon;

  return (
    <Button
      aria-label="Copy"
      className="size-7 shrink-0 text-muted-foreground"
      onClick={handleCopy}
      size="icon"
      type="button"
      variant="ghost"
    >
      <Icon className="size-3.5" />
    </Button>
  );
}

function ToolSectionHeader({
  label,
  copyText,
}: {
  label: string;
  copyText: string;
}) {
  return (
    <div className="flex items-center justify-between gap-2">
      <h4 className="font-medium text-muted-foreground text-xs uppercase tracking-wide">
        {label}
      </h4>
      <CopyButton text={copyText} />
    </div>
  );
}

export const ToolInput = ({ className, input, ...props }: ToolInputProps) => {
  const code = JSON.stringify(input, null, 2);

  return (
    <div className={cn("space-y-2 overflow-hidden", className)} {...props}>
      <ToolSectionHeader copyText={code} label="Parameters" />
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

  const copyText = serializeToolOutput(output, errorText);
  const label = errorText ? "Error" : "Result";

  let content: ReactNode;

  if (typeof output === "object" && output !== null && !isValidElement(output)) {
    content = (
      <CodeBlock code={JSON.stringify(output, null, 2)} language="json" />
    );
  } else if (typeof output === "string") {
    content = <CodeBlock code={output} language="json" />;
  } else if (output) {
    content = <div className="p-4 text-xs">{output as ReactNode}</div>;
  } else {
    content = null;
  }

  return (
    <div className={cn("space-y-2", className)} {...props}>
      <ToolSectionHeader copyText={copyText} label={label} />
      {errorText ? (
        <div className="rounded-md bg-destructive/10 p-4 text-destructive text-xs">
          {errorText}
        </div>
      ) : null}
      {content}
    </div>
  );
};
