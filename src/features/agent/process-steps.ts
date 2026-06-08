import {
  normalizeMessageProcessSteps,
  type MessageProcessStep,
  type MessageToolInvocation,
} from "@/lib/db";

import type { AgentChatMessage } from "./types";
import { toApiToolCalls, type AgentToolCall } from "./tools";

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
      const toolContent = invocation
        ? serializeStoredToolOutput(invocation)
        : null;

      if (invocation && toolContent) {
        messages.push({
          role: "tool",
          tool_call_id: invocation.id,
          name: invocation.name,
          content: toolContent,
        });
      }
    }
  }

  flushAssistantSegment();
  return messages.length > 0 ? messages : null;
}

function toStoredToolCall(invocation: MessageToolInvocation): AgentToolCall {
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

function serializeStoredToolOutput(
  invocation: MessageToolInvocation
): string | null {
  if (invocation.output !== undefined) {
    return JSON.stringify(invocation.output);
  }

  if (!invocation.errorText?.trim()) {
    return null;
  }

  return JSON.stringify({
    ok: false,
    tool: invocation.name,
    error: {
      code: "tool_error",
      message: invocation.errorText,
    },
  });
}
