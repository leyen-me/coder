import { useSyncExternalStore } from "react";

export type SessionCompactUiPhase =
  | "loading"
  | "queued"
  | "success"
  | "noop"
  | "error";

export type SessionCompactUiState = {
  phase: SessionCompactUiPhase;
  anchorAfterMessageId: string | null;
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
