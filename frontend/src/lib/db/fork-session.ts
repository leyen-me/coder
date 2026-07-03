import {
  createMessage,
  createMessageId,
  getMessagesBySession,
} from "./messages";
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
  });

  await Promise.all(
    messagesToCopy.map((message) =>
      createMessage({
        id: createMessageId(),
        sessionId: forkedSession.id,
        role: message.role,
        messageKind: message.messageKind,
        content: message.content,
        images: message.images,
        thinking: message.thinking,
        processSteps: message.processSteps ?? [],
        toolInvocations: message.toolInvocations ?? [],
        status: normalizeForkedMessageStatus(message.status),
        taskId: null,
        error: message.error,
        createdAt: message.createdAt,
      })
    )
  );

  notifyDbChange();
  return forkedSession;
}
