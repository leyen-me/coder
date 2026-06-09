"use client";

import { MessageToolItem } from "./message-tool-list";
import { StreamingMessageContent } from "./streaming-message-content";
import { StreamingPlainText } from "./streaming-message-content";

import type { AssistantProcessStep } from "./assistant-process";

type AssistantProcessViewProps = {
  steps: AssistantProcessStep[];
};

export function AssistantProcessView({ steps }: AssistantProcessViewProps) {
  return (
    <div className="flex w-full flex-col gap-3">
      {steps.map((step) => {
        if (step.kind === "tool") {
          return <MessageToolItem invocation={step.invocation} key={step.id} />;
        }

        if (step.kind === "reasoning") {
          return (
            <StreamingPlainText
              className="text-muted-foreground"
              isStreaming={step.isStreaming}
              key={step.id}
              text={step.text}
            />
          );
        }

        return (
          <StreamingMessageContent
            isStreaming={step.isStreaming}
            key={step.id}
            text={step.text}
          />
        );
      })}
    </div>
  );
}
