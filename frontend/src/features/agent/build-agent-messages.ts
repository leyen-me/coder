import { buildSystemPrompt } from "./environment/build-system-prompt";
import type { AgentEnvironment } from "./environment/types";
import { hasAgentMessageContent } from "./message-content";
import { assertValidToolCallChain } from "./process-steps";
import type { AgentChatMessage, AgentMode } from "./types";
import {
  buildSessionPolicySystemPrompt,
  type AgentSessionPolicy,
} from "./session-policy";
import { getAgentTodosBySession } from "@/lib/db/agent-todos";
import {
  extractSkillSlugsFromText,
  injectReferencedSkillsIntoUserContent,
} from "@/features/skills/lib/parse-skill-references";
import { resolveEnabledSkillsBySlugs } from "@/features/skills/lib/resolve-skills";

const TODO_SNAPSHOT_LIMIT = 8;

export async function buildAgentMessages(
  history: AgentChatMessage[],
  environment: AgentEnvironment,
  agentMode?: AgentMode,
  sessionId?: string,
  sessionPolicy?: AgentSessionPolicy | null
): Promise<AgentChatMessage[]> {
  const conversation = history.filter((message) => hasMessagePayload(message));
  assertValidToolCallChain(conversation);

  // When building from a plan, truncate the conversation to only include
  // messages from the build instruction onward. The planning conversation
  // (user questions + plan responses) is irrelevant for execution and would
  // waste context tokens and potentially confuse the agent with stale context.
  // The plan content is already embedded in the build prompt message.
  const trimmedConversation = trimToBuildBoundary(conversation);

  const withSkillInjection = await applyReferencedSkillsToConversation(trimmedConversation);
  const todoSnapshotMessage = await buildTodoSnapshotSystemMessage(sessionId);
  const sessionPolicyPrompt = buildSessionPolicySystemPrompt(sessionPolicy);

  return [
    { role: "system", content: buildSystemPrompt(environment, agentMode) },
    ...(sessionPolicyPrompt
      ? [{ role: "system" as const, content: sessionPolicyPrompt }]
      : []),
    ...(todoSnapshotMessage ? [todoSnapshotMessage] : []),
    ...withSkillInjection,
  ];
}

async function buildTodoSnapshotSystemMessage(
  sessionId: string | undefined
): Promise<AgentChatMessage | null> {
  const normalizedSessionId = sessionId?.trim();
  if (!normalizedSessionId) {
    return null;
  }

  const todos = await getAgentTodosBySession(normalizedSessionId);
  if (todos.length === 0) {
    return null;
  }

  const activeTodos = todos.filter(
    (todo) => todo.status === "pending" || todo.status === "in_progress"
  );
  if (activeTodos.length === 0) {
    return null;
  }

  const visibleTodos = activeTodos.slice(0, TODO_SNAPSHOT_LIMIT);
  const hiddenTodos = activeTodos.length - visibleTodos.length;

  const lines = [
    "## Current session todo state",
    "Persisted active todos for this chat session.",
    "Completed or cancelled todos are omitted to save tokens.",
    "Use todo_read if you need the full list before updating with todo_write.",
    "",
    ...visibleTodos.map(
      (todo) => `- [${todo.status}] ${todo.id}: ${todo.content}`
    ),
    ...(hiddenTodos > 0
      ? [`- ... ${hiddenTodos} more active todos omitted; call todo_read for full state.`]
      : []),
  ];

  return {
    role: "system",
    content: lines.join("\n"),
  };
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
    const slugs =
      message.referencedSkills !== undefined
        ? message.referencedSkills
        : extractSkillSlugsFromText(content);
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

/**
 * Detects the build-from-plan boundary and truncates history so only messages
 * from the build instruction onward are sent to the model.
 *
 * When a user clicks "Build" on a plan, a special user message is created by
 * buildPlanExecutionPrompt() that starts with "Please implement the following plan".
 * Everything before that message is the planning conversation (user questions +
 * plan responses) and should not be included in the LLM context during execution.
 * The plan content is already embedded in the build prompt itself.
 */
function trimToBuildBoundary(messages: AgentChatMessage[]): AgentChatMessage[] {
  const BUILD_PROMPT_MARKER = "implement the following plan";

  // Scan from the end to find the last user message that matches the build prompt.
  // Manual loop from the end to avoid relying on ES2023 Array.findLastIndex.
  let buildBoundary = -1;
  for (let i = messages.length - 1; i >= 0; i -= 1) {
    const message = messages[i];
    if (
      message.role === "user" &&
      typeof message.content === "string" &&
      message.content.includes(BUILD_PROMPT_MARKER)
    ) {
      buildBoundary = i;
      break;
    }
  }

  if (buildBoundary <= 0) {
    return messages;
  }

  return messages.slice(buildBoundary);
}
