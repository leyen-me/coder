"use client";

import { MessageToolItem } from "./message-tool-list";
import { StreamingMessageContent } from "./streaming-message-content";
import { ThinkingBlock } from "./thinking-block";

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
            <ThinkingBlock
              key={step.id}
              isStreaming={step.isStreaming}
              segments={[{ kind: "text", text: step.text }]}
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
