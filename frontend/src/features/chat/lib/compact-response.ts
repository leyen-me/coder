import type { MessageRecord } from "@/lib/db";

import { estimateCompactEventAfterMessageId } from "./estimate-compact-anchor";
import type { SessionCompactUiState } from "./session-compact-ui-store";

export type CompactApiResponse = {
  ok: boolean;
  compacted: boolean;
  code: string;
  removedCount?: number;
  remainingCount?: number;
  anchorAfterMessageId?: string | null;
  firstKeptMessageId?: string | null;
  compactMessageId?: string | null;
  summaryPreview?: string | null;
};

export type CompactApiRequest = {
  sessionId: string;
  taskId?: string;
  force?: boolean;
};

function conversationMessages(
  messages: readonly MessageRecord[],
): MessageRecord[] {
  return messages.filter((message) => message.messageKind !== "compact");
}

function resolveEventAfterMessageId(
  messages: readonly MessageRecord[],
  input: {
    anchorAfterMessageId?: string | null;
    compactMessageId?: string | null;
  },
): string | null {
  if (
    input.anchorAfterMessageId &&
    conversationMessages(messages).some(
      (message) => message.id === input.anchorAfterMessageId,
    )
  ) {
    return input.anchorAfterMessageId;
  }

  const compactMessage =
    (input.compactMessageId
      ? messages.find((message) => message.id === input.compactMessageId)
      : undefined) ??
    [...messages].reverse().find((message) => message.messageKind === "compact");

  if (!compactMessage) {
    return estimateCompactEventAfterMessageId(messages);
  }

  const conversation = conversationMessages(messages);
  const chronologicalAfter = [...conversation]
    .reverse()
    .find((message) => message.createdAt < compactMessage.createdAt);
  return chronologicalAfter?.id ?? conversation.at(-1)?.id ?? null;
}

function resolveTemporaryPlacement(
  messages: readonly MessageRecord[],
): string | null {
  return estimateCompactEventAfterMessageId(messages);
}

export function compactUiFromApiResponse(
  messages: readonly MessageRecord[],
  response: CompactApiResponse,
): SessionCompactUiState {
  switch (response.code) {
    case "agent_running":
      return {
        phase: "error",
        boundaryAfterMessageId: resolveTemporaryPlacement(messages),
        i18nKey: "chat.compactBlockedWhileRunning",
      };
    case "queued":
      return {
        phase: "queued",
        boundaryAfterMessageId: resolveTemporaryPlacement(messages),
        i18nKey: "chat.compactQueued",
      };
    case "compacted":
      return {
        phase: "success",
        boundaryAfterMessageId: resolveEventAfterMessageId(messages, {
          anchorAfterMessageId: response.anchorAfterMessageId,
          compactMessageId: response.compactMessageId,
        }),
        preview: response.summaryPreview ?? undefined,
        removedCount: response.removedCount,
        i18nKey: "chat.compactSuccess",
        i18nParams: {
          removedCount: response.removedCount ?? 0,
          remainingCount: response.remainingCount ?? 0,
        },
      };
    case "noop_already_fits":
      return {
        phase: "noop",
        boundaryAfterMessageId: resolveTemporaryPlacement(messages),
        i18nKey: "chat.compactNoopAlreadyFits",
      };
    case "not_enough_messages":
      return {
        phase: "noop",
        boundaryAfterMessageId: resolveTemporaryPlacement(messages),
        i18nKey: "chat.compactNoopNotEnoughMessages",
      };
    default:
      return {
        phase: "error",
        boundaryAfterMessageId: resolveTemporaryPlacement(messages),
        i18nKey: "chat.compactFailed",
      };
  }
}

export function compactUiFromAgentCompleted(
  messages: readonly MessageRecord[],
  input: {
    removedCount: number;
    summaryPreview: string;
    firstKeptMessageId?: string | null;
    compactMessageId?: string | null;
    anchorAfterMessageId?: string | null;
  },
): SessionCompactUiState {
  if (input.removedCount === 0) {
    return {
      phase: "noop",
      boundaryAfterMessageId: resolveTemporaryPlacement(messages),
      i18nKey: "chat.compactNoopAlreadyFits",
    };
  }

  return {
    phase: "success",
    boundaryAfterMessageId: resolveEventAfterMessageId(messages, {
      anchorAfterMessageId: input.anchorAfterMessageId,
      compactMessageId: input.compactMessageId,
    }),
    preview: input.summaryPreview,
    removedCount: input.removedCount,
    i18nKey: "chat.compactSuccess",
    i18nParams: {
      removedCount: input.removedCount,
      remainingCount: Math.max(
        0,
        conversationMessages(messages).length - input.removedCount,
      ),
    },
  };
}
