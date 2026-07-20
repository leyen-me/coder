import type { MessageRecord } from "@/lib/db";

/** Matches backend `COMPACT_USER_MESSAGE_MAX_TOKENS`. */
export const COMPACT_TAIL_TOKEN_BUDGET = 20_000;

function estimateRecordTokens(record: MessageRecord): number {
  return Math.ceil(record.content.length / 2);
}

function conversationMessages(messages: readonly MessageRecord[]): MessageRecord[] {
  return messages.filter((message) => message.messageKind !== "compact");
}

/**
 * Estimate where a compact boundary will appear: the id of the message
 * immediately before the first kept message after compaction.
 */
export function estimateCompactAnchorAfterMessageId(
  messages: readonly MessageRecord[],
): string | null {
  const conversation = conversationMessages(messages);
  if (conversation.length < 2) {
    return null;
  }

  let selected = 0;
  let remaining = COMPACT_TAIL_TOKEN_BUDGET;

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

  if (selected === 0 || selected >= conversation.length) {
    return conversation.at(-1)?.id ?? null;
  }

  const firstKeptIndex = conversation.length - selected;
  if (firstKeptIndex === 0) {
    return null;
  }

  return conversation[firstKeptIndex - 1]?.id ?? null;
}
