"use client";

import { useMemo } from "react";

import {
  extractSendEmailData,
  getSendEmailInputData,
} from "@/features/agent/tools/send-email-display";
import type { ToolUIPart } from "ai";
import { MailIcon } from "lucide-react";

import { CollapsibleToolSection } from "@/components/ai-elements/collapsible-tool-section";
import { ToolStatusIcon } from "@/features/chat/components/tool-status-icon";

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
    <CollapsibleToolSection
      className={className}
      errorText={isError ? errorText : undefined}
      header={
        <>
          <ToolStatusIcon state={state} />
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
        </>
      }
    >
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
    </CollapsibleToolSection>
  );
}
