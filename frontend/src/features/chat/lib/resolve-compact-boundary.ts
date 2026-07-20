import type { MessageRecord } from "@/lib/db";

import { compactBannerFromUiState } from "../components/compact-separator";
import { compactPreviewFromMessage } from "./resolve-persisted-compact";
import { estimateCompactBoundaryBeforeMessageId } from "./estimate-compact-anchor";
import type { SessionCompactUiState } from "./session-compact-ui-store";

export type CompactBoundaryRender = {
  /** Timeline slot: render the compact event immediately before this message. */
  beforeMessageId: string;
  phase: SessionCompactUiState["phase"];
  titleKey: string;
  descriptionKey: string;
  titleParams?: Record<string, string | number>;
  preview?: string;
};

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

function placementForCompactMessage(
  messages: readonly MessageRecord[],
  compactMessage: MessageRecord,
): string | null {
  if (isConversationMessage(messages, compactMessage.taskId)) {
    return compactMessage.taskId;
  }

  const afterCompact = messages.find(
    (message) =>
      message.messageKind !== "compact" &&
      message.createdAt > compactMessage.createdAt,
  );
  return afterCompact?.id ?? null;
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

    const beforeMessageId = placementForCompactMessage(messages, compactMessage);
    if (!beforeMessageId || seen.has(beforeMessageId)) {
      continue;
    }

    seen.add(beforeMessageId);
    renders.push({
      beforeMessageId,
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

  return (
    estimateCompactBoundaryBeforeMessageId(messages, {
      force: import.meta.env.DEV,
    }) ??
    messages.filter((message) => message.messageKind !== "compact").at(-1)
      ?.id ??
    null
  );
}

function mergeTransientOverPersisted(
  persisted: CompactBoundaryRender[],
  transient: CompactBoundaryRender,
): CompactBoundaryRender[] {
  return [
    ...persisted.filter(
      (render) => render.beforeMessageId !== transient.beforeMessageId,
    ),
    transient,
  ];
}

/**
 * Resolve compact timeline events.
 *
 * - Persisted compact markers always render at their real event points
 * - loading/queued/noop/error may add one temporary tip
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
    const beforeMessageId =
      (isConversationMessage(messages, compactUi.boundaryBeforeMessageId)
        ? compactUi.boundaryBeforeMessageId
        : null) ??
      persisted.at(-1)?.beforeMessageId ??
      null;
    if (!beforeMessageId) {
      return persisted;
    }

    const banner = compactBannerFromUiState(compactUi);
    return mergeTransientOverPersisted(persisted, {
      beforeMessageId,
      phase: banner.phase,
      titleKey: banner.titleKey,
      descriptionKey: banner.descriptionKey,
      titleParams: banner.titleParams,
      preview: banner.preview,
    });
  }

  const beforeMessageId = resolveTemporaryPlacement(
    messages,
    compactUi.boundaryBeforeMessageId,
  );
  if (!beforeMessageId) {
    return persisted;
  }

  const banner = compactBannerFromUiState(compactUi);
  return mergeTransientOverPersisted(persisted, {
    beforeMessageId,
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
