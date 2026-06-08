import { buildSystemPrompt } from "./environment/build-system-prompt";
import type { AgentEnvironment } from "./environment/types";
import { hasAgentMessageContent } from "./message-content";
import { assertValidToolCallChain } from "./process-steps";
import type { AgentChatMessage } from "./types";

export function buildAgentMessages(
  history: AgentChatMessage[],
  environment: AgentEnvironment
): AgentChatMessage[] {
  const conversation = history.filter((message) => hasMessagePayload(message));
  assertValidToolCallChain(conversation);

  return [
    { role: "system", content: buildSystemPrompt(environment) },
    ...conversation,
  ];
}

function hasMessagePayload(message: AgentChatMessage): boolean {
  if (message.role === "assistant") {
    const text =
      typeof message.content === "string" ? message.content : undefined;
    const reasoning = message.reasoning_content;
    return (
      Boolean(text?.trim()) ||
      Boolean(reasoning?.trim()) ||
      Boolean(message.tool_calls?.length)
    );
  }

  if (message.role === "tool") {
    return Boolean(message.tool_call_id?.trim());
  }

  return hasAgentMessageContent(message.content);
}
