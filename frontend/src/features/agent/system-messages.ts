import { buildSystemPrompt } from "./environment/build-system-prompt";
import type { AgentEnvironment } from "./environment/types";
import { joinPromptBlocks } from "./prompt-blocks";
import {
  buildSessionPolicySystemPrompt,
  type AgentSessionPolicy,
} from "./session-policy";
import type { AgentChatMessage, AgentMode } from "./types";
import { getAgentTodosBySession } from "@/lib/db/agent-todos";

const TODO_SNAPSHOT_LIMIT = 8;

type AssembleSystemMessagesInput = {
  environment: AgentEnvironment;
  agentMode?: AgentMode;
  sessionId?: string;
  sessionPolicy?: AgentSessionPolicy | null;
};

export async function assembleSystemMessages({
  environment,
  agentMode,
  sessionId,
  sessionPolicy,
}: AssembleSystemMessagesInput): Promise<AgentChatMessage[]> {
  const todoSnapshotMessage = await buildTodoSnapshotSystemMessage(sessionId);
  const sessionPolicyPrompt = buildSessionPolicySystemPrompt(sessionPolicy);

  return [
    { role: "system", content: buildSystemPrompt(environment, agentMode) },
    ...(sessionPolicyPrompt
      ? [{ role: "system" as const, content: sessionPolicyPrompt }]
      : []),
    ...(todoSnapshotMessage ? [todoSnapshotMessage] : []),
  ];
}

export function serializeSystemMessages(
  messages: readonly Pick<AgentChatMessage, "role" | "content">[]
): string {
  return joinPromptBlocks(
    messages.map((message) =>
      message.role === "system" && typeof message.content === "string"
        ? message.content
        : null
    )
  );
}

export async function buildTodoSnapshotSystemMessage(
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
