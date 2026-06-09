import {
  normalizeMessageProcessSteps,
  type MessageProcessStep,
  type MessageToolInvocation,
} from "@/lib/db";

import type { AgentChatMessage } from "./types";
import { toApiToolCalls, type AgentToolCall } from "./tools";

export function mergeProcessSteps(
  existing: MessageProcessStep[] | undefined,
  incoming: MessageProcessStep[]
): MessageProcessStep[] {
  const existingSteps = normalizeMessageProcessSteps(existing);
  if (existingSteps.length === 0) {
    return incoming.map((step) => ({ ...step }));
  }

  const mergedById = new Map(
    existingSteps.map((step) => [step.id, { ...step }] as const)
  );
  for (const step of incoming) {
    mergedById.set(step.id, { ...step });
  }

  const orderedIds: string[] = [];
  for (const step of existingSteps) {
    if (!orderedIds.includes(step.id)) {
      orderedIds.push(step.id);
    }
  }
  for (const step of incoming) {
    if (!orderedIds.includes(step.id)) {
      orderedIds.push(step.id);
    }
  }

  return orderedIds
    .map((id) => mergedById.get(id))
    .filter((step): step is MessageProcessStep => step != null);
}

/** When the API streams only `reasoning_content`, keep the reasoning step and add an answer. */
export function ensureAnswerForReasoningOnlyTurn(
  steps: MessageProcessStep[]
): MessageProcessStep[] {
  const hasTool = steps.some((step) => step.kind === "tool");
  const hasAnswer = steps.some((step) => step.kind === "answer");
  if (hasTool || hasAnswer) {
    return steps;
  }

  const reasoningText = steps
    .filter((step) => step.kind === "reasoning")
    .map((step) => step.text)
    .join("");

  if (!reasoningText.trim()) {
    return steps;
  }

  return [
    ...steps,
    {
      id: `answer:${steps.length}`,
      kind: "answer",
      text: reasoningText,
    },
  ];
}

export function deriveMessageFieldsFromProcessSteps(
  steps: MessageProcessStep[]
): { thinking: string; content: string } {
  let thinking = "";
  let finalAnswer = "";
  let segmentAnswer = "";

  for (const step of steps) {
    if (step.kind === "reasoning") {
      thinking += step.text;
      continue;
    }

    if (step.kind === "answer") {
      segmentAnswer += step.text;
      continue;
    }

    if (step.kind === "tool") {
      segmentAnswer = "";
    }
  }

  finalAnswer = segmentAnswer;
  return { thinking, content: finalAnswer };
}

export function processStepsIncludeAllTools(
  processSteps: MessageProcessStep[] | undefined,
  toolInvocations: MessageToolInvocation[]
): boolean {
  if (toolInvocations.length === 0) {
    return true;
  }

  const toolStepIds = new Set(
    normalizeMessageProcessSteps(processSteps)
      .filter((step) => step.kind === "tool")
      .map((step) => step.toolCallId)
  );

  return toolInvocations.every((invocation) => toolStepIds.has(invocation.id));
}

export function serializeInvocationToolContent(
  invocation: MessageToolInvocation
): string {
  if (invocation.output !== undefined) {
    return JSON.stringify(invocation.output);
  }

  if (invocation.errorText?.trim()) {
    return JSON.stringify({
      ok: false,
      tool: invocation.name,
      error: {
        code: "tool_error",
        message: invocation.errorText,
      },
    });
  }

  return JSON.stringify({
    ok: false,
    tool: invocation.name,
    error: {
      code: "missing_output",
      message: "Tool result was not persisted.",
    },
  });
}

export function buildAgentMessagesFromProcessSteps(
  processSteps: MessageProcessStep[] | undefined,
  toolInvocations: MessageToolInvocation[],
  options: { includeReasoning: boolean }
): AgentChatMessage[] | null {
  const steps = normalizeMessageProcessSteps(processSteps);
  if (steps.length === 0) {
    return null;
  }

  const toolById = new Map(
    toolInvocations.map((invocation) => [invocation.id, invocation] as const)
  );
  const messages: AgentChatMessage[] = [];

  let reasoningText = "";
  let contentText = "";

  const flushAssistantSegment = (toolCallId?: string) => {
    const reasoning = reasoningText.trim();
    const content = contentText.trim();
    const invocation = toolCallId ? toolById.get(toolCallId) : undefined;

    if (!reasoning && !content && !invocation) {
      return;
    }

    const assistantMessage: AgentChatMessage = { role: "assistant" };

    if (content) {
      assistantMessage.content = content;
    }

    if (reasoning && options.includeReasoning) {
      assistantMessage.reasoning_content = reasoning;
    }

    if (invocation) {
      assistantMessage.tool_calls = toApiToolCalls([toStoredToolCall(invocation)]);
    }

    messages.push(assistantMessage);
    reasoningText = "";
    contentText = "";
  };

  for (const step of steps) {
    if (step.kind === "reasoning") {
      reasoningText += step.text;
      continue;
    }

    if (step.kind === "answer") {
      contentText += step.text;
      continue;
    }

    if (step.kind === "tool") {
      flushAssistantSegment(step.toolCallId);

      const invocation = toolById.get(step.toolCallId);
      if (invocation) {
        messages.push({
          role: "tool",
          tool_call_id: invocation.id,
          name: invocation.name,
          content: serializeInvocationToolContent(invocation),
        });
      }
    }
  }

  flushAssistantSegment();

  if (messages.length === 0) {
    const reasoning = reasoningText.trim();
    const content = contentText.trim();
    if (reasoning && !content && !options.includeReasoning) {
      return [{ role: "assistant", content: reasoning }];
    }
  }

  return messages.length > 0 ? messages : null;
}

export function toStoredToolCall(invocation: MessageToolInvocation): AgentToolCall {
  return {
    id: invocation.id,
    name: invocation.name,
    arguments: serializeStoredToolInput(invocation.input),
  };
}

function serializeStoredToolInput(input: unknown): string {
  if (
    input &&
    typeof input === "object" &&
    !Array.isArray(input) &&
    "raw" in input &&
    typeof (input as { raw?: unknown }).raw === "string" &&
    Object.keys(input).length === 1
  ) {
    return (input as { raw: string }).raw;
  }

  return JSON.stringify(input ?? {});
}

export function assertValidToolCallChain(messages: AgentChatMessage[]): void {
  for (let index = 0; index < messages.length; index += 1) {
    const message = messages[index];
    if (message.role !== "assistant" || !message.tool_calls?.length) {
      continue;
    }

    const expectedIds = new Set(message.tool_calls.map((call) => call.id));
    let cursor = index + 1;

    while (expectedIds.size > 0 && cursor < messages.length) {
      const next = messages[cursor];
      if (next.role !== "tool") {
        break;
      }

      if (next.tool_call_id && expectedIds.has(next.tool_call_id)) {
        expectedIds.delete(next.tool_call_id);
      }

      cursor += 1;
    }

    if (expectedIds.size > 0) {
      throw new Error(
        "Invalid agent history: assistant tool_calls are missing matching tool responses."
      );
    }
  }
}
