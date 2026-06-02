import { buildSystemPrompt } from "./environment/build-system-prompt";
import type { AgentEnvironment } from "./environment/types";
import type { AgentChatMessage } from "./types";

export function buildAgentMessages(
  history: AgentChatMessage[],
  environment: AgentEnvironment
): AgentChatMessage[] {
  const conversation = history.filter((message) => hasMessagePayload(message));

  return [
    { role: "system", content: buildSystemPrompt(environment) },
    ...conversation,
  ];
}

function hasMessagePayload(message: AgentChatMessage): boolean {
  if (message.role === "assistant") {
    return (
      Boolean(message.content?.trim()) ||
      Boolean(message.tool_calls?.length)
    );
  }

  if (message.role === "tool") {
    return Boolean(message.content?.trim());
  }

  return Boolean(message.content?.trim());
}
