import {
  normalizeMessageProcessSteps,
  type MessageProcessStep,
  type MessageToolInvocation,
} from "@/lib/db";

export type AssistantProcessStep =
  | {
      id: string;
      kind: "reasoning";
      text: string;
      isStreaming: boolean;
    }
  | {
      id: string;
      kind: "tool";
      invocation: MessageToolInvocation;
    }
  | {
      id: string;
      kind: "answer";
      text: string;
      isStreaming: boolean;
    };

export type ThinkingSegment =
  | {
      kind: "text";
      text: string;
    }
  | {
      kind: "tool";
      invocation: MessageToolInvocation;
    };

export type AssistantProcessPresentation = {
  thinkingSegments: ThinkingSegment[];
  isThinkingStreaming: boolean;
  answer: {
    text: string;
    isStreaming: boolean;
  } | null;
};

const pendingToolStates = new Set<MessageToolInvocation["state"]>([
  "input-available",
  "input-streaming",
]);

export function buildAssistantProcessPresentation(
  steps: AssistantProcessStep[]
): AssistantProcessPresentation {
  const thinkingSegments: ThinkingSegment[] = [];
  let answer: AssistantProcessPresentation["answer"] = null;

  for (const step of steps) {
    if (step.kind === "answer") {
      answer = {
        text: step.text,
        isStreaming: step.isStreaming,
      };
      continue;
    }

    if (step.kind === "reasoning") {
      thinkingSegments.push({
        kind: "text",
        text: step.text,
      });
      continue;
    }

    thinkingSegments.push({
      kind: "tool",
      invocation: step.invocation,
    });
  }

  const isThinkingStreaming =
    steps.some((step) => step.kind === "reasoning" && step.isStreaming) ||
    steps.some(
      (step) =>
        step.kind === "tool" && pendingToolStates.has(step.invocation.state)
    );

  return {
    thinkingSegments,
    isThinkingStreaming,
    answer,
  };
}

export function buildAssistantProcessSteps(input: {
  processSteps?: MessageProcessStep[];
  answerText: string;
  thinkingText: string;
  isThinkingStreaming: boolean;
  showReasoning: boolean;
  toolInvocations: MessageToolInvocation[];
  isAnswerStreaming: boolean;
  isMessageStreaming: boolean;
}): AssistantProcessStep[] {
  const hideStreamingAnswer =
    input.isMessageStreaming && (input.showReasoning || input.toolInvocations.length > 0);
  const persistedSteps = normalizeMessageProcessSteps(input.processSteps);
  if (persistedSteps.length > 0) {
    return buildPersistedAssistantProcessSteps(
      persistedSteps,
      input.toolInvocations,
      input.isMessageStreaming,
      hideStreamingAnswer
    );
  }

  const steps: AssistantProcessStep[] = [];

  if (input.showReasoning) {
    steps.push({
      id: "reasoning",
      kind: "reasoning",
      text: input.thinkingText,
      isStreaming: input.isThinkingStreaming,
    });
  }

  for (const invocation of input.toolInvocations) {
    steps.push({
      id: `tool:${invocation.id}`,
      kind: "tool",
      invocation,
    });
  }

  if (input.answerText && !hideStreamingAnswer) {
    steps.push({
      id: "answer",
      kind: "answer",
      text: input.answerText,
      isStreaming: input.isAnswerStreaming,
    });
  }

  return steps;
}

function buildPersistedAssistantProcessSteps(
  processSteps: MessageProcessStep[],
  toolInvocations: MessageToolInvocation[],
  isMessageStreaming: boolean,
  hideStreamingAnswer: boolean
): AssistantProcessStep[] {
  const toolInvocationsById = new Map(
    toolInvocations.map((invocation) => [invocation.id, invocation] as const)
  );
  const lastTextStepId = [...processSteps]
    .reverse()
    .find((step) => step.kind !== "tool")?.id;

  const resolvedSteps: AssistantProcessStep[] = [];

  for (const step of processSteps) {
    if (step.kind === "tool") {
      const invocation = toolInvocationsById.get(step.toolCallId);
      if (invocation) {
        resolvedSteps.push({
          id: `tool:${invocation.id}`,
          kind: "tool",
          invocation,
        });
      }
      continue;
    }

    if (!step.text.trim()) {
      continue;
    }

    if (hideStreamingAnswer && step.kind === "answer") {
      continue;
    }

    resolvedSteps.push({
        id: step.id,
        kind: step.kind,
        text: step.text,
        isStreaming: isMessageStreaming && step.id === lastTextStepId,
      });
  }

  return resolvedSteps;
}
