import {
  normalizeToolInvocations,
  type MessageRecord,
  type MessageToolInvocation,
} from "@/lib/db";

import { buildUserAgentContent } from "./message-content";
import {
  buildAgentMessagesFromProcessSteps,
  processStepsIncludeAllTools,
  serializeInvocationToolContent,
  toStoredToolCall,
} from "./process-steps";
import { toApiToolCalls } from "./tools";
import type { AgentChatMessage } from "./types";

export function messageRecordToAgentMessages(
  message: MessageRecord
): AgentChatMessage[] {
  if (message.role === "user") {
    return [
      {
        role: "user",
        content: buildUserAgentContent(message.content, message.images ?? []),
        ...(message.referencedSkills !== undefined
          ? { referencedSkills: message.referencedSkills }
          : {}),
      },
    ];
  }

  const toolInvocations = normalizeToolInvocations(message.toolInvocations);
  const includeReasoning = toolInvocations.length > 0;
  const canUseProcessSteps = processStepsIncludeAllTools(
    message.processSteps,
    toolInvocations
  );
  const fromProcessSteps = canUseProcessSteps
    ? buildAgentMessagesFromProcessSteps(
        message.processSteps,
        toolInvocations,
        { includeReasoning }
      )
    : null;

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

  // Guard: assistant message must have content or tool_calls for the API
  if (!assistantMessage.content && !assistantMessage.tool_calls?.length) {
    return [];
  }

  return [
    assistantMessage,
    ...toolInvocations.map((invocation) => ({
      role: "tool" as const,
      tool_call_id: invocation.id,
      name: invocation.name,
      content: serializeInvocationToolContent(invocation),
    })),
  ];
}
