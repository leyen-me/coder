"use client";

import { useMemo } from "react";

import { cn } from "@/lib/utils";

import {
  extractSendEmailData,
  getSendEmailInputData,
} from "@/features/agent/tools/send-email-display";
import type { ToolUIPart } from "ai";
import {
  CheckCircle2Icon,
  CircleIcon,
  LoaderCircleIcon,
  MailIcon,
  XCircleIcon,
} from "lucide-react";

type SendEmailToolOutputProps = {
  output: unknown;
  input: unknown;
  toolName: string;
  state: ToolUIPart["state"];
  errorText?: string;
  className?: string;
};

export function SendEmailToolOutput({
  output,
  input,
  toolName,
  state,
  errorText,
  className,
}: SendEmailToolOutputProps) {
  const result = useMemo(() => extractSendEmailData(output), [output]);
  const inputData = useMemo(() => getSendEmailInputData(input), [input]);

  const isSuccess = result !== null;
  const isError = state === "output-error" && errorText;

  return (
    <div className={cn("w-full overflow-hidden rounded-md border", className)}>
      {/* Header */}
      <div
        className={cn(
          "flex items-center gap-2 border-b px-3 py-1.5 text-xs",
          isError
            ? "bg-destructive/5"
            : isSuccess
              ? "bg-success/5"
              : "bg-muted/30",
        )}
      >
        {isError ? (
          <XCircleIcon className="size-3.5 shrink-0 text-destructive" />
        ) : isSuccess ? (
          <CheckCircle2Icon className="size-3.5 shrink-0 text-green-600" />
        ) : (
          <ToolStatusIcon state={state} />
        )}
        <MailIcon className="size-3.5 shrink-0 text-muted-foreground" />
        <span className="font-mono font-medium text-foreground">
          {toolName}
        </span>
        {inputData ? (
          <>
            <span className="text-muted-foreground">·</span>
            <span
              className="max-w-[160px] truncate font-mono text-muted-foreground"
              title={inputData.to}
            >
              {inputData.to}
            </span>
          </>
        ) : null}
        {isSuccess ? (
          <span className="ml-auto rounded-full bg-success/10 px-1.5 py-0.5 font-mono text-[10px] font-medium text-success">
            sent
          </span>
        ) : null}
      </div>

      {/* Error */}
      {isError ? (
        <div className="bg-destructive/10 px-3 py-2.5 text-xs text-destructive">
          {errorText}
        </div>
      ) : null}

      {/* Success body */}
      {isSuccess && inputData ? (
        <div className="space-y-1.5 p-3 text-xs">
          <div className="flex gap-2">
            <span className="w-14 shrink-0 font-medium text-muted-foreground">
              Subject
            </span>
            <span className="text-foreground">{inputData.subject}</span>
          </div>
          {inputData.body ? (
            <div className="flex gap-2">
              <span className="w-14 shrink-0 font-medium text-muted-foreground">
                Body
              </span>
              <span className="line-clamp-2 text-muted-foreground">
                {inputData.body}
              </span>
            </div>
          ) : null}
          {result?.message ? (
            <div className="flex gap-2">
              <span className="w-14 shrink-0 font-medium text-muted-foreground">
                Result
              </span>
              <span className="text-green-600">{result.message}</span>
            </div>
          ) : null}
        </div>
      ) : null}

      {/* Failed body */}
      {isError && inputData ? (
        <div className="space-y-1.5 p-3 text-xs">
          <div className="flex gap-2">
            <span className="w-14 shrink-0 font-medium text-muted-foreground">
              To
            </span>
            <span className="text-foreground">{inputData.to}</span>
          </div>
          <div className="flex gap-2">
            <span className="w-14 shrink-0 font-medium text-muted-foreground">
              Subject
            </span>
            <span className="text-foreground">{inputData.subject}</span>
          </div>
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
