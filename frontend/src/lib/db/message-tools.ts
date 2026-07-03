import { getMessage, updateMessage } from "./messages";
import type { MessageToolInvocation, MessageToolState } from "./types";

const TOOL_STATE_RANK: Record<MessageToolState, number> = {
  "input-streaming": 0,
  "input-available": 1,
  "output-available": 2,
  "output-error": 2,
};

export function normalizeToolInvocations(
  invocations: MessageToolInvocation[] | undefined
): MessageToolInvocation[] {
  return invocations ?? [];
}

/** Prefer the furthest-along tool state when merging streaming flushes with direct writes. */
export function mergeToolInvocations(
  existing: MessageToolInvocation[] | undefined,
  incoming: MessageToolInvocation[]
): MessageToolInvocation[] {
  if (incoming.length === 0) {
    return normalizeToolInvocations(existing);
  }

  const mergedById = new Map<string, MessageToolInvocation>();
  for (const invocation of normalizeToolInvocations(existing)) {
    mergedById.set(invocation.id, invocation);
  }

  for (const invocation of incoming) {
    const previous = mergedById.get(invocation.id);
    if (
      !previous ||
      TOOL_STATE_RANK[invocation.state] >= TOOL_STATE_RANK[previous.state]
    ) {
      mergedById.set(invocation.id, invocation);
    }
  }

  const orderedIds: string[] = [];
  for (const invocation of normalizeToolInvocations(existing)) {
    if (mergedById.has(invocation.id) && !orderedIds.includes(invocation.id)) {
      orderedIds.push(invocation.id);
    }
  }
  for (const invocation of incoming) {
    if (!orderedIds.includes(invocation.id)) {
      orderedIds.push(invocation.id);
    }
  }

  return orderedIds
    .map((id) => mergedById.get(id))
    .filter((invocation): invocation is MessageToolInvocation => invocation != null);
}

export async function addMessageToolInvocation(
  messageId: string,
  invocation: MessageToolInvocation
): Promise<MessageToolInvocation[] | null> {
  return upsertMessageToolInvocation(messageId, invocation);
}

export async function upsertMessageToolInvocation(
  messageId: string,
  invocation: MessageToolInvocation
): Promise<MessageToolInvocation[] | null> {
  const existing = await getMessage(messageId);
  if (!existing) {
    return null;
  }

  const toolInvocations = mergeToolInvocations(
    existing.toolInvocations,
    [invocation]
  );

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
