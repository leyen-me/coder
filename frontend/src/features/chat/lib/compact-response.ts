import type { MessageRecord } from "@/lib/db";

import { estimateCompactAnchorAfterMessageId } from "./estimate-compact-anchor";
import type { SessionCompactUiState } from "./session-compact-ui-store";

export type CompactApiResponse = {
  ok: boolean;
  compacted: boolean;
  code: string;
  removedCount?: number;
  remainingCount?: number;
  anchorAfterMessageId?: string | null;
  compactMessageId?: string | null;
  summaryPreview?: string | null;
};

export function compactUiFromApiResponse(
  messages: readonly MessageRecord[],
  response: CompactApiResponse,
): SessionCompactUiState {
  const anchorAfterMessageId =
    response.anchorAfterMessageId ??
    estimateCompactAnchorAfterMessageId(messages);

  switch (response.code) {
    case "queued":
      return {
        phase: "queued",
        anchorAfterMessageId,
        i18nKey: "chat.compactQueued",
      };
    case "compacted":
      return {
        phase: "success",
        anchorAfterMessageId,
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
        anchorAfterMessageId,
        i18nKey: "chat.compactNoopAlreadyFits",
      };
    case "not_enough_messages":
      return {
        phase: "noop",
        anchorAfterMessageId,
        i18nKey: "chat.compactNoopNotEnoughMessages",
      };
    default:
      return {
        phase: "error",
        anchorAfterMessageId,
        i18nKey: "chat.compactFailed",
      };
  }
}

export function compactUiFromAgentCompleted(
  messages: readonly MessageRecord[],
  input: {
    removedCount: number;
    summaryPreview: string;
  },
): SessionCompactUiState {
  const anchorAfterMessageId = estimateCompactAnchorAfterMessageId(messages);

  if (input.removedCount === 0) {
    return {
      phase: "noop",
      anchorAfterMessageId,
      i18nKey: "chat.compactNoopAlreadyFits",
    };
  }

  return {
    phase: "success",
    anchorAfterMessageId,
    preview: input.summaryPreview,
    removedCount: input.removedCount,
    i18nKey: "chat.compactSuccess",
    i18nParams: {
      removedCount: input.removedCount,
      remainingCount: Math.max(
        0,
        messages.filter((message) => message.messageKind !== "compact").length -
          input.removedCount +
          1,
      ),
    },
  };
}
