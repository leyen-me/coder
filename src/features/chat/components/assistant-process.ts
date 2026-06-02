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
  const persistedSteps = normalizeMessageProcessSteps(input.processSteps);
  if (persistedSteps.length > 0) {
    return buildPersistedAssistantProcessSteps(
      persistedSteps,
      input.toolInvocations,
      input.isMessageStreaming
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

  if (input.answerText) {
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
  isMessageStreaming: boolean
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

    resolvedSteps.push({
        id: step.id,
        kind: step.kind,
        text: step.text,
        isStreaming: isMessageStreaming && step.id === lastTextStepId,
      });
  }

  return resolvedSteps;
}
