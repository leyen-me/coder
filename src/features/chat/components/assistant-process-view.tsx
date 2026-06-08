"use client";

import { buildAssistantProcessPresentation } from "./assistant-process";
import { StreamingMessageContent } from "./streaming-message-content";
import { ThinkingBlock } from "./thinking-block";

import type { AssistantProcessStep } from "./assistant-process";

type AssistantProcessViewProps = {
  steps: AssistantProcessStep[];
};

export function AssistantProcessView({ steps }: AssistantProcessViewProps) {
  const presentation = buildAssistantProcessPresentation(steps);
  const hasThinking =
    presentation.thinkingSegments.length > 0 ||
    presentation.isThinkingStreaming;

  return (
    <div className="flex w-full flex-col gap-3">
      {hasThinking ? (
        <ThinkingBlock
          isStreaming={presentation.isThinkingStreaming}
          segments={presentation.thinkingSegments}
        />
      ) : null}

      {presentation.answer?.text ? (
        <StreamingMessageContent
          isStreaming={presentation.answer.isStreaming}
          text={presentation.answer.text}
        />
      ) : null}
    </div>
  );
}
