"use client";

import {
  MessageContent,
  MessageResponse,
} from "@/components/ai-elements/message";
import { buildAssistantProcessPresentation } from "./assistant-process";
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
          isCompact={presentation.isCompact}
          isStreaming={presentation.isThinkingStreaming}
          segments={presentation.thinkingSegments}
        />
      ) : null}

      {presentation.answer?.text ? (
        <MessageContent className="group-[.is-assistant]:overflow-visible group-[.is-assistant]:bg-transparent group-[.is-assistant]:p-0">
          <MessageResponse isAnimating={presentation.answer.isStreaming}>
            {presentation.answer.text}
          </MessageResponse>
        </MessageContent>
      ) : null}
    </div>
  );
}
