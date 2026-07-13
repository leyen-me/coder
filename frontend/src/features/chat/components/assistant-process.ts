import {
  normalizeMessageProcessSteps,
  type MessageProcessStep,
  type MessageToolInvocation,
} from "@/lib/db";
import type {
  DecisionOption,
  DecisionResponse,
  DecisionRiskLevel,
  DecisionTrigger,
} from "@/lib/decision";

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
    }
  | {
      id: string;
      kind: "decision";
      trigger: DecisionTrigger;
      summary: string;
      question: string;
      options: DecisionOption[];
      riskLevel: DecisionRiskLevel;
      status: "requested" | "resolved";
      requiresUserConfirmation: boolean;
      response?: DecisionResponse | null;
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
      input.answerText,
      input.thinkingText,
      input.showReasoning,
      input.isMessageStreaming
    );
  }

  const steps: AssistantProcessStep[] = [];

  if (input.showReasoning && input.thinkingText.trim()) {
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

  if (input.answerText.trim()) {
    steps.push({
      id: "answer",
      kind: "answer",
      text: input.answerText,
      isStreaming: input.isAnswerStreaming,
    });
  }

  return steps;
}

export function getAssistantTimelineSteps(input: {
  steps: AssistantProcessStep[];
  isPlanMessage: boolean;
}): AssistantProcessStep[] {
  return input.steps;
}

export function getAssistantProcessInteriorSteps(input: {
  steps: AssistantProcessStep[];
  isMessageStreaming: boolean;
}): AssistantProcessStep[] {
  if (input.isMessageStreaming) {
    return input.steps;
  }

  const lastAnswerIndex = input.steps.reduceRight(
    (found, step, index) => (found !== -1 ? found : step.kind === "answer" ? index : -1),
    -1
  );
  if (lastAnswerIndex === -1) {
    return input.steps;
  }

  // Hide only the final answer inside the process panel. It is rendered
  // outside the collapsible after the turn finishes to avoid duplication.
  return input.steps.filter(
    (step, index) => step.kind !== "answer" || index !== lastAnswerIndex
  );
}

export function shouldRenderStandaloneAssistantAnswer(input: {
  steps: AssistantProcessStep[];
  isPlanMessage: boolean;
}): boolean {
  return !shouldShowAssistantProcessTimeline(input);
}

/** Whether the ordered process timeline should render (reasoning, tools, or decisions). */
export function shouldShowAssistantProcessTimeline(input: {
  steps: AssistantProcessStep[];
  isPlanMessage: boolean;
}): boolean {
  return getAssistantTimelineSteps(input).some(
    (step) =>
      step.kind === "reasoning" ||
      step.kind === "tool" ||
      (step.kind === "decision" &&
        (step.status === "requested" ||
          (step.status === "resolved" && step.response != null)))
  );
}

function buildPersistedAssistantProcessSteps(
  processSteps: MessageProcessStep[],
  toolInvocations: MessageToolInvocation[],
  answerText: string,
  thinkingText: string,
  showReasoning: boolean,
  isMessageStreaming: boolean
): AssistantProcessStep[] {
  const toolInvocationsById = new Map(
    toolInvocations.map((invocation) => [invocation.id, invocation] as const)
  );
  const lastTextStepId = [...processSteps]
    .reverse()
    .find((step) => step.kind !== "tool")?.id;

  const resolvedSteps: AssistantProcessStep[] = [];
  let lastReasoningIndex = -1;
  let lastAnswerIndex = -1;

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

    if (step.kind === "decision") {
      resolvedSteps.push({
        id: step.id,
        kind: "decision",
        trigger: step.trigger,
        summary: step.summary,
        question: step.question,
        options: step.options,
        riskLevel: step.riskLevel,
        status: step.status,
        requiresUserConfirmation: step.requiresUserConfirmation,
        response: step.response,
      });
      continue;
    }

    if (!step.text.trim()) {
      continue;
    }

    if (step.kind === "reasoning" && !showReasoning) {
      continue;
    }

    resolvedSteps.push({
      id: step.id,
      kind: step.kind,
      text: step.text,
      isStreaming: isMessageStreaming && step.id === lastTextStepId,
    });

    if (step.kind === "reasoning") {
      lastReasoningIndex = resolvedSteps.length - 1;
      continue;
    }

    lastAnswerIndex = resolvedSteps.length - 1;
  }

  const normalizedThinking = thinkingText.trim();
  if (showReasoning && normalizedThinking) {
    if (lastReasoningIndex === -1) {
      resolvedSteps.unshift({
        id: "reasoning:compat",
        kind: "reasoning",
        text: normalizedThinking,
        isStreaming: isMessageStreaming && !answerText.trim(),
      });
    }
  }

  const normalizedAnswer = answerText.trim();
  if (normalizedAnswer) {
    if (lastAnswerIndex === -1) {
      resolvedSteps.push({
        id: "answer:compat",
        kind: "answer",
        text: normalizedAnswer,
        isStreaming: isMessageStreaming,
      });
    } else {
      const existing = resolvedSteps[lastAnswerIndex];
      if (
        existing?.kind === "answer" &&
        existing.text !== normalizedAnswer
      ) {
        resolvedSteps[lastAnswerIndex] = {
          ...existing,
          text: normalizedAnswer,
          isStreaming: isMessageStreaming,
        };
      }
    }
  }

  return resolvedSteps;
}
export function getLatestAssistantAnswerText(
  steps: AssistantProcessStep[]
): string {
  for (let index = steps.length - 1; index >= 0; index -= 1) {
    const step = steps[index];
    if (step?.kind === "answer") {
      return step.text;
    }
  }

  return "";
}
