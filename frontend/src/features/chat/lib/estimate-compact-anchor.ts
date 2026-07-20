import type { MessageRecord } from "@/lib/db";

/** Matches backend `COMPACT_USER_MESSAGE_MAX_TOKENS`. */
export const COMPACT_TAIL_TOKEN_BUDGET = 20_000;

function estimateRecordTokens(record: MessageRecord): number {
  return Math.ceil(record.content.length / 2);
}

function conversationMessages(messages: readonly MessageRecord[]): MessageRecord[] {
  return messages.filter((message) => message.messageKind !== "compact");
}

function selectTailKeepCount(
  conversation: readonly MessageRecord[],
  options?: { force?: boolean },
): number {
  if (conversation.length < 2) {
    return conversation.length;
  }

  let selected = 0;
  let remaining =
    options?.force && import.meta.env.DEV
      ? 512
      : COMPACT_TAIL_TOKEN_BUDGET;

  for (let index = conversation.length - 1; index >= 0; index -= 1) {
    const message = conversation[index];
    if (!message) {
      continue;
    }
    const tokens = estimateRecordTokens(message);
    if (tokens <= remaining) {
      selected += 1;
      remaining -= tokens;
    } else {
      break;
    }
  }

  if (
    options?.force &&
    import.meta.env.DEV &&
    conversation.length >= 2 &&
    (selected === 0 || selected >= conversation.length)
  ) {
    return 1;
  }

  if (selected === 0 || selected >= conversation.length) {
    return conversation.length;
  }

  return selected;
}

/**
 * The first message in the kept tail — render the compact banner immediately
 * BEFORE this message (same slot as the loading overlay).
 */
export function estimateCompactBoundaryBeforeMessageId(
  messages: readonly MessageRecord[],
  options?: { force?: boolean },
): string | null {
  const conversation = conversationMessages(messages);
  if (conversation.length === 0) {
    return null;
  }

  const keepCount = selectTailKeepCount(conversation, options);
  const firstKeptIndex = conversation.length - keepCount;
  return conversation[firstKeptIndex]?.id ?? null;
}

/** @deprecated Prefer `estimateCompactBoundaryBeforeMessageId`. */
export function estimateCompactAnchorAfterMessageId(
  messages: readonly MessageRecord[],
): string | null {
  const conversation = conversationMessages(messages);
  const boundaryBefore = estimateCompactBoundaryBeforeMessageId(messages);
  if (!boundaryBefore) {
    return null;
  }

  const firstKeptIndex = conversation.findIndex(
    (message) => message.id === boundaryBefore,
  );
  if (firstKeptIndex <= 0) {
    return null;
  }

  return conversation[firstKeptIndex - 1]?.id ?? null;
}
