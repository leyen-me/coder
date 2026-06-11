import { buildSystemPrompt } from "./environment/build-system-prompt";
import type { AgentEnvironment } from "./environment/types";
import { hasAgentMessageContent } from "./message-content";
import { assertValidToolCallChain } from "./process-steps";
import type { AgentChatMessage, AgentMode } from "./types";
import {
  extractSkillSlugsFromText,
  injectReferencedSkillsIntoUserContent,
} from "@/features/skills/lib/parse-skill-references";
import { resolveEnabledSkillsBySlugs } from "@/features/skills/lib/resolve-skills";

export async function buildAgentMessages(
  history: AgentChatMessage[],
  environment: AgentEnvironment,
  agentMode?: AgentMode
): Promise<AgentChatMessage[]> {
  const conversation = history.filter((message) => hasMessagePayload(message));
  assertValidToolCallChain(conversation);

  const withSkillInjection = await applyReferencedSkillsToConversation(conversation);

  return [
    { role: "system", content: buildSystemPrompt(environment, agentMode) },
    ...withSkillInjection,
  ];
}

async function applyReferencedSkillsToConversation(
  messages: AgentChatMessage[]
): Promise<AgentChatMessage[]> {
  const result: AgentChatMessage[] = [];

  for (const message of messages) {
    if (message.role !== "user") {
      result.push(message);
      continue;
    }

    const content =
      typeof message.content === "string" ? message.content : "";
    const slugs = extractSkillSlugsFromText(content);
    if (slugs.length === 0) {
      result.push(message);
      continue;
    }

    const resolved = await resolveEnabledSkillsBySlugs(slugs);
    if (!resolved.ok) {
      result.push(message);
      continue;
    }

    const userSkills = resolved.skills.filter((skill) => skill.source === "user");
    if (userSkills.length === 0) {
      result.push(message);
      continue;
    }

    result.push({
      ...message,
      content: injectReferencedSkillsIntoUserContent(
        content,
        userSkills.map((skill) => ({ slug: skill.slug, content: skill.content }))
      ),
    });
  }

  return result;
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
