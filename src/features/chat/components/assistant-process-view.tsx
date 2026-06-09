"use client";

import { buildAssistantProcessPresentation } from "./assistant-process";
import { MessageToolItem } from "./message-tool-list";
import { StreamingMessageContent } from "./streaming-message-content";
import { ThinkingBlock } from "./thinking-block";

import type { AssistantProcessStep } from "./assistant-process";

type AssistantProcessViewProps = {
  steps: AssistantProcessStep[];
  showReasoning: boolean;
};

export function AssistantProcessView({
  steps,
  showReasoning,
}: AssistantProcessViewProps) {
  const presentation = buildAssistantProcessPresentation(steps);

  if (showReasoning) {
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

  const toolInvocations = presentation.thinkingSegments.flatMap((segment) =>
    segment.kind === "tool" ? [segment.invocation] : []
  );
  const isToolStreaming =
    presentation.isThinkingStreaming && toolInvocations.length > 0;

  return (
    <div className="flex w-full flex-col gap-3">
      {toolInvocations.length > 0 ? (
        <div className="flex w-full flex-col gap-2">
          {toolInvocations.map((invocation) => (
            <MessageToolItem invocation={invocation} key={invocation.id} />
          ))}
        </div>
      ) : isToolStreaming ? (
        <div className="flex items-center gap-2 text-sm text-muted-foreground">
          <span className="size-1.5 animate-pulse rounded-full bg-muted-foreground" />
          <span className="animate-pulse">...</span>
        </div>
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
