import { getMessage, updateMessage } from "./messages";
import type { MessageToolInvocation } from "./types";

export function normalizeToolInvocations(
  invocations: MessageToolInvocation[] | undefined
): MessageToolInvocation[] {
  return invocations ?? [];
}

export async function addMessageToolInvocation(
  messageId: string,
  invocation: MessageToolInvocation
): Promise<MessageToolInvocation[] | null> {
  const existing = await getMessage(messageId);
  if (!existing) {
    return null;
  }

  const toolInvocations = [
    ...normalizeToolInvocations(existing.toolInvocations),
    invocation,
  ];

  const updated = await updateMessage(messageId, { toolInvocations });
  return updated ? toolInvocations : null;
}

export async function completeMessageToolInvocation(
  messageId: string,
  toolCallId: string,
  patch: Pick<MessageToolInvocation, "state" | "output" | "errorText">
): Promise<MessageToolInvocation[] | null> {
  const existing = await getMessage(messageId);
  if (!existing) {
    return null;
  }

  const toolInvocations = normalizeToolInvocations(existing.toolInvocations).map(
    (invocation) =>
      invocation.id === toolCallId ? { ...invocation, ...patch } : invocation
  );

  const updated = await updateMessage(messageId, { toolInvocations });
  return updated ? toolInvocations : null;
}
