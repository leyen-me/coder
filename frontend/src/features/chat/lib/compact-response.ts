import type { MessageRecord } from "@/lib/db";

import { estimateCompactBoundaryBeforeMessageId } from "./estimate-compact-anchor";
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

function resolvePersistedCompactPlacement(
  messages: readonly MessageRecord[],
  input: {
    firstKeptMessageId?: string | null;
    compactMessageId?: string | null;
  },
): string | null {
  if (
    input.firstKeptMessageId &&
    messages.some(
      (message) =>
        message.id === input.firstKeptMessageId &&
        message.messageKind !== "compact",
    )
  ) {
    return input.firstKeptMessageId;
  }

  const compactMessage =
    (input.compactMessageId
      ? messages.find((message) => message.id === input.compactMessageId)
      : undefined) ??
    [...messages].reverse().find((message) => message.messageKind === "compact");

  if (
    compactMessage?.taskId &&
    messages.some(
      (message) =>
        message.id === compactMessage.taskId &&
        message.messageKind !== "compact",
    )
  ) {
    return compactMessage.taskId;
  }

  return null;
}

/**
 * Temporary UI placement only — used while compact is pending, or for
 * noop/error tips that must not pretend to be a historical compact event.
 */
function resolveTemporaryPlacement(
  messages: readonly MessageRecord[],
): string | null {
  return (
    estimateCompactBoundaryBeforeMessageId(messages, {
      force: import.meta.env.DEV,
    }) ??
    messages.filter((message) => message.messageKind !== "compact").at(-1)
      ?.id ??
    null
  );
}

export function compactUiFromApiResponse(
  messages: readonly MessageRecord[],
  response: CompactApiResponse,
): SessionCompactUiState {
  switch (response.code) {
    case "queued":
      return {
        phase: "queued",
        boundaryBeforeMessageId: resolveTemporaryPlacement(messages),
        i18nKey: "chat.compactQueued",
      };
    case "compacted":
      return {
        phase: "success",
        boundaryBeforeMessageId: resolvePersistedCompactPlacement(messages, {
          firstKeptMessageId: response.firstKeptMessageId,
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
        boundaryBeforeMessageId: resolveTemporaryPlacement(messages),
        i18nKey: "chat.compactNoopAlreadyFits",
      };
    case "not_enough_messages":
      return {
        phase: "noop",
        boundaryBeforeMessageId: resolveTemporaryPlacement(messages),
        i18nKey: "chat.compactNoopNotEnoughMessages",
      };
    default:
      return {
        phase: "error",
        boundaryBeforeMessageId: resolveTemporaryPlacement(messages),
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
  },
): SessionCompactUiState {
  if (input.removedCount === 0) {
    return {
      phase: "noop",
      boundaryBeforeMessageId: resolveTemporaryPlacement(messages),
      i18nKey: "chat.compactNoopAlreadyFits",
    };
  }

  return {
    phase: "success",
    // Success must land on the real compact event point. Never invent one.
    boundaryBeforeMessageId: resolvePersistedCompactPlacement(messages, input),
    preview: input.summaryPreview,
    removedCount: input.removedCount,
    i18nKey: "chat.compactSuccess",
    i18nParams: {
      removedCount: input.removedCount,
      // Conversation messages still present in the model context after compact.
      remainingCount: Math.max(
        0,
        messages.filter((message) => message.messageKind !== "compact").length -
          input.removedCount,
      ),
    },
  };
}
