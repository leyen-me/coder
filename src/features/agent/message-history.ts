import {
  normalizeToolInvocations,
  type MessageRecord,
  type MessageToolInvocation,
} from "@/lib/db";

import { buildUserAgentContent } from "./message-content";
import {
  buildAgentMessagesFromProcessSteps,
} from "./process-steps";
import { toApiToolCalls, type AgentToolCall } from "./tools";
import type { AgentChatMessage } from "./types";

export function messageRecordToAgentMessages(
  message: MessageRecord
): AgentChatMessage[] {
  if (message.role === "user") {
    return [
      {
        role: "user",
        content: buildUserAgentContent(message.content, message.images ?? []),
      },
    ];
  }

  const toolInvocations = normalizeToolInvocations(message.toolInvocations);
  const includeReasoning = toolInvocations.length > 0;
  const fromProcessSteps = buildAgentMessagesFromProcessSteps(
    message.processSteps,
    toolInvocations,
    { includeReasoning }
  );

  if (fromProcessSteps) {
    return fromProcessSteps;
  }

  return buildLegacyAssistantMessages(message, toolInvocations, includeReasoning);
}

function buildLegacyAssistantMessages(
  message: MessageRecord,
  toolInvocations: MessageToolInvocation[],
  includeReasoning: boolean
): AgentChatMessage[] {
  const assistantMessage: AgentChatMessage = {
    role: "assistant",
  };
  const content = message.content.trim();
  const reasoningContent = message.thinking.trim();

  if (content) {
    assistantMessage.content = content;
  }

  if (reasoningContent && includeReasoning) {
    assistantMessage.reasoning_content = reasoningContent;
  }

  if (toolInvocations.length > 0) {
    assistantMessage.tool_calls = toApiToolCalls(
      toolInvocations.map(toStoredToolCall)
    );
  }

  return [
    assistantMessage,
    ...toolInvocations.flatMap((invocation) => {
      const toolContent = serializeStoredToolOutput(invocation);
      if (!toolContent) {
        return [];
      }

      return [
        {
          role: "tool" as const,
          tool_call_id: invocation.id,
          name: invocation.name,
          content: toolContent,
        },
      ];
    }),
  ];
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
