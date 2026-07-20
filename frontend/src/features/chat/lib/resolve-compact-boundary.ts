import type { MessageRecord } from "@/lib/db";

import { compactBannerFromUiState } from "../components/compact-separator";
import { compactPreviewFromMessage } from "./resolve-persisted-compact";
import { estimateCompactEventAfterMessageId } from "./estimate-compact-anchor";
import type { SessionCompactUiState } from "./session-compact-ui-store";

export type CompactBoundaryRender = {
  /** Timeline slot: render the compact event immediately after this message. */
  afterMessageId: string;
  phase: SessionCompactUiState["phase"];
  titleKey: string;
  descriptionKey: string;
  titleParams?: Record<string, string | number>;
  preview?: string;
};

function conversationMessages(
  messages: readonly MessageRecord[],
): MessageRecord[] {
  return messages.filter((message) => message.messageKind !== "compact");
}

function isConversationMessage(
  messages: readonly MessageRecord[],
  messageId: string | null | undefined,
): messageId is string {
  return Boolean(
    messageId &&
      messages.some(
        (message) =>
          message.id === messageId && message.messageKind !== "compact",
      ),
  );
}

/**
 * Resolve the UI event point for a persisted compact marker.
 *
 * New markers sit after the latest conversation message at compact time.
 * Legacy mid-inserted markers (first_kept chronologically after the marker)
 * are repaired to the end of that compact era.
 */
function placementAfterCompactMessage(
  messages: readonly MessageRecord[],
  compactMessage: MessageRecord,
): string | null {
  const conversation = conversationMessages(messages);
  if (conversation.length === 0) {
    return null;
  }

  const firstKept = conversation.find(
    (message) => message.id === compactMessage.taskId,
  );
  const chronologicalAfter = [...conversation]
    .reverse()
    .find((message) => message.createdAt < compactMessage.createdAt);

  // Legacy bug: marker was inserted before the kept window.
  if (firstKept && firstKept.createdAt > compactMessage.createdAt) {
    const nextCompact = messages.find(
      (message) =>
        message.messageKind === "compact" &&
        message.createdAt > compactMessage.createdAt,
    );
    const endBound = nextCompact?.createdAt ?? Number.POSITIVE_INFINITY;
    return (
      conversation.filter((message) => message.createdAt < endBound).at(-1)
        ?.id ?? chronologicalAfter?.id ?? null
    );
  }

  return chronologicalAfter?.id ?? conversation.at(-1)?.id ?? null;
}

/** Auto-compact markers that already live as process-panel steps. */
function hasInlineAutoCompactStep(
  messages: readonly MessageRecord[],
  compactMessageId: string,
): boolean {
  return messages.some((message) =>
    (message.processSteps ?? []).some(
      (step) =>
        step.kind === "compact" &&
        (step.compactMessageId === compactMessageId ||
          step.id === `compact:${compactMessageId}`),
    ),
  );
}

function resolvePersistedCompactRenders(
  messages: readonly MessageRecord[],
): CompactBoundaryRender[] {
  const renders: CompactBoundaryRender[] = [];
  const seen = new Set<string>();

  for (const compactMessage of messages) {
    if (compactMessage.messageKind !== "compact") {
      continue;
    }

    // Mid-turn auto-compact is shown inside the assistant process panel.
    if (hasInlineAutoCompactStep(messages, compactMessage.id)) {
      continue;
    }

    const afterMessageId = placementAfterCompactMessage(
      messages,
      compactMessage,
    );
    if (!afterMessageId || seen.has(afterMessageId)) {
      continue;
    }

    seen.add(afterMessageId);
    renders.push({
      afterMessageId,
      phase: "success",
      titleKey: "chat.compactBoundaryTitle",
      descriptionKey: "chat.compactBoundaryFallback",
      preview: compactPreviewFromMessage(compactMessage),
    });
  }

  return renders;
}

function resolveTemporaryPlacement(
  messages: readonly MessageRecord[],
  explicit: string | null | undefined,
): string | null {
  if (isConversationMessage(messages, explicit)) {
    return explicit;
  }

  return estimateCompactEventAfterMessageId(messages);
}

function mergeTransientOverPersisted(
  persisted: CompactBoundaryRender[],
  transient: CompactBoundaryRender,
): CompactBoundaryRender[] {
  return [
    ...persisted.filter(
      (render) => render.afterMessageId !== transient.afterMessageId,
    ),
    transient,
  ];
}

/**
 * Resolve compact timeline events.
 *
 * - Persisted markers render after their real event message
 * - loading/queued/noop/error may add one temporary tip at the end
 * - success temporary UI overlays the matching real event point
 */
export function resolveCompactBoundaryRenders(
  messages: readonly MessageRecord[],
  compactUi: SessionCompactUiState | null | undefined,
): CompactBoundaryRender[] {
  const persisted = resolvePersistedCompactRenders(messages);

  if (!compactUi) {
    return persisted;
  }

  if (compactUi.phase === "success") {
    const afterMessageId =
      (isConversationMessage(messages, compactUi.boundaryAfterMessageId)
        ? compactUi.boundaryAfterMessageId
        : null) ??
      persisted.at(-1)?.afterMessageId ??
      null;
    if (!afterMessageId) {
      return persisted;
    }

    const banner = compactBannerFromUiState(compactUi);
    return mergeTransientOverPersisted(persisted, {
      afterMessageId,
      phase: banner.phase,
      titleKey: banner.titleKey,
      descriptionKey: banner.descriptionKey,
      titleParams: banner.titleParams,
      preview: banner.preview,
    });
  }

  const afterMessageId = resolveTemporaryPlacement(
    messages,
    compactUi.boundaryAfterMessageId,
  );
  if (!afterMessageId) {
    return persisted;
  }

  const banner = compactBannerFromUiState(compactUi);
  return mergeTransientOverPersisted(persisted, {
    afterMessageId,
    phase: banner.phase,
    titleKey: banner.titleKey,
    descriptionKey: banner.descriptionKey,
    titleParams: banner.titleParams,
    preview:
      compactUi.phase === "loading" || compactUi.phase === "queued"
        ? banner.preview
        : undefined,
  });
}

/** @deprecated Prefer resolveCompactBoundaryRenders */
export function resolveCompactBoundaryRender(
  messages: readonly MessageRecord[],
  compactUi: SessionCompactUiState | null | undefined,
): CompactBoundaryRender | null {
  return resolveCompactBoundaryRenders(messages, compactUi).at(-1) ?? null;
}

export function hasCompactBoundary(
  messages: readonly MessageRecord[],
  compactUi: SessionCompactUiState | null | undefined,
): boolean {
  return resolveCompactBoundaryRenders(messages, compactUi).length > 0;
}
