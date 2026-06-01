import type { AgentChatMessage } from "./types";

/** Default system prompt injected at the start of every agent request. */
export const AGENT_SYSTEM_PROMPT =
  "You are Coder, a helpful desktop AI assistant. Reply in the same language the user uses. Be concise, accurate, and friendly.";

export function buildAgentMessages(
  history: AgentChatMessage[]
): AgentChatMessage[] {
  const conversation = history.filter(
    (message) => message.content.trim().length > 0
  );

  return [{ role: "system", content: AGENT_SYSTEM_PROMPT }, ...conversation];
}
