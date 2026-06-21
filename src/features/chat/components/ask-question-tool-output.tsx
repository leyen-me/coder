"use client";

import {
  CheckCircle2Icon,
  CircleIcon,
  CircleHelpIcon,
  ListChecksIcon,
  LoaderCircleIcon,
  MessageSquareTextIcon,
  XCircleIcon,
} from "lucide-react";
import type { ToolUIPart } from "ai";

import { formatAskQuestionOutputForDisplay } from "@/features/agent/tools/ask-question-display";
import { cn } from "@/lib/utils";

type AskQuestionToolOutputProps = {
  output: unknown;
  toolName: string;
  state: ToolUIPart["state"];
  errorText?: string;
  className?: string;
};

export function AskQuestionToolOutput({
  output,
  toolName,
  state,
  errorText,
  className,
}: AskQuestionToolOutputProps) {
  const data = formatAskQuestionOutputForDisplay(output);
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
              {data.answers.length}/{data.questionCount} answered
            </span>
            {data.title ? (
              <>
                <span className="text-muted-foreground">·</span>
                <span className="truncate text-muted-foreground/70">
                  {data.title}
                </span>
              </>
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
        /* Answers list */
        <div className="divide-y">
          {data.answers.map((answer) => (
            <div
              key={answer.question_id}
              className="space-y-1 px-3 py-2.5"
            >
              <div className="flex items-start gap-2">
                <CircleHelpIcon className="mt-0.5 size-3.5 shrink-0 text-muted-foreground" />
                <span className="min-w-0 flex-1 text-xs font-medium text-foreground">
                  {answer.prompt}
                </span>
              </div>
              <div className="ml-5.5 flex flex-wrap gap-1.5">
                {answer.selected_option_labels.length > 0 ? (
                  answer.selected_option_labels.map((label) => (
                    <span
                      key={label}
                      className="inline-flex items-center gap-1 rounded-full bg-primary/10 px-2 py-0.5 text-[11px] font-medium text-primary"
                    >
                      <ListChecksIcon className="size-3" />
                      {label}
                    </span>
                  ))
                ) : (
                  <span className="text-[11px] italic text-muted-foreground/60">
                    (no selection)
                  </span>
                )}
                {answer.other_text ? (
                  <span className="inline-flex items-center gap-1 rounded-full bg-muted-foreground/10 px-2 py-0.5 text-[11px] text-muted-foreground">
                    <MessageSquareTextIcon className="size-3" />
                    {answer.other_text}
                  </span>
                ) : null}
              </div>
            </div>
          ))}
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
