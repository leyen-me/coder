import { useSyncExternalStore } from "react";

export type SessionCompactUiPhase =
  | "loading"
  | "queued"
  | "success"
  | "noop"
  | "error";

export type SessionCompactUiState = {
  phase: SessionCompactUiPhase;
  /**
   * Compact timeline event slot: render immediately AFTER this conversation
   * message. Success/persisted must use the real event point (last message at
   * compact time); loading/queued/noop/error may use a temporary estimate.
   */
  boundaryAfterMessageId: string | null;
  preview?: string;
  removedCount?: number;
  i18nKey: string;
  i18nParams?: Record<string, string | number>;
};

const states = new Map<string, SessionCompactUiState>();
const listeners = new Set<() => void>();

function emit() {
  for (const listener of listeners) {
    listener();
  }
}

export function getSessionCompactUi(
  sessionId: string,
): SessionCompactUiState | null {
  return states.get(sessionId) ?? null;
}

export function setSessionCompactUi(
  sessionId: string,
  state: SessionCompactUiState | null,
) {
  if (state === null) {
    if (!states.has(sessionId)) {
      return;
    }
    states.delete(sessionId);
  } else {
    states.set(sessionId, state);
  }
  emit();
}

export function subscribeSessionCompactUi(listener: () => void) {
  listeners.add(listener);
  return () => {
    listeners.delete(listener);
  };
}

export function useSessionCompactUi(sessionId: string) {
  return useSyncExternalStore(
    subscribeSessionCompactUi,
    () => getSessionCompactUi(sessionId),
    () => getSessionCompactUi(sessionId),
  );
}
