import {
  createMessage,
  createMessageId,
  getMessagesBySession,
} from "./messages";
import { copyAgentTodosForSession } from "./agent-todos";
import { createSession, getSession } from "./sessions";
import { notifyDbChange } from "./subscriptions";
import type { MessageStatus, SessionRecord } from "./types";

function normalizeForkedMessageStatus(status: MessageStatus): MessageStatus {
  if (status === "pending" || status === "streaming") {
    return "completed";
  }
  return status;
}

export async function forkSessionFromMessage(
  sourceSessionId: string,
  upToMessageId: string,
  title: string
): Promise<SessionRecord> {
  const [session, messages] = await Promise.all([
    getSession(sourceSessionId),
    getMessagesBySession(sourceSessionId),
  ]);

  if (!session) {
    throw new Error(`Session not found: ${sourceSessionId}`);
  }

  const cutoffIndex = messages.findIndex((message) => message.id === upToMessageId);
  if (cutoffIndex === -1) {
    throw new Error(`Message not found: ${upToMessageId}`);
  }

  const messagesToCopy = messages.slice(0, cutoffIndex + 1);
  const forkedSession = await createSession({
    title,
    model: session.model,
    provider: session.provider,
    workspaceDir: session.workspaceDir,
    sessionKind: session.sessionKind,
    autonomyMode: session.autonomyMode,
    decisionPolicyVersion: session.decisionPolicyVersion,
    decisionModel: session.decisionModel ?? null,
    planFileName: session.planFileName ?? null,
    planBuiltAt: session.planBuiltAt ?? null,
  });

  // Remap IDs so compact markers can keep a valid first_kept cursor
  // (stored in taskId) inside the forked session.
  const idMap = new Map<string, string>();
  for (const message of messagesToCopy) {
    idMap.set(message.id, createMessageId());
  }

  await Promise.all(
    messagesToCopy.map((message) => {
      const newId = idMap.get(message.id);
      if (!newId) {
        throw new Error(`Missing forked message id for ${message.id}`);
      }

      const isCompact = message.messageKind === "compact";
      const remappedFirstKept =
        isCompact && message.taskId
          ? (idMap.get(message.taskId) ?? null)
          : null;

      return createMessage({
        id: newId,
        sessionId: forkedSession.id,
        role: message.role,
        messageKind: message.messageKind,
        content: message.content,
        images: message.images,
        referencedSkills: message.referencedSkills,
        thinking: message.thinking,
        processSteps: message.processSteps ?? [],
        toolInvocations: message.toolInvocations ?? [],
        status: normalizeForkedMessageStatus(message.status),
        // Agent task ids must not be reused across sessions. Compact markers
        // reuse taskId as the model-context first_kept cursor and need remap.
        taskId: remappedFirstKept,
        error: message.error,
        durationMs: message.durationMs,
        usage: message.usage,
        createdAt: message.createdAt,
      });
    })
  );

  await copyAgentTodosForSession(sourceSessionId, forkedSession.id);

  notifyDbChange();
  return forkedSession;
}
