import { useSyncExternalStore } from "react";

const generatingSessionIds = new Set<string>();
const listeners = new Set<() => void>();

function emit(): void {
  for (const listener of listeners) {
    listener();
  }
}

export function markSessionTitleGenerating(sessionId: string): void {
  if (generatingSessionIds.has(sessionId)) {
    return;
  }
  generatingSessionIds.add(sessionId);
  emit();
}

export function clearSessionTitleGenerating(sessionId: string): void {
  if (!generatingSessionIds.delete(sessionId)) {
    return;
  }
  emit();
}

export function isSessionTitleGenerating(sessionId: string): boolean {
  return generatingSessionIds.has(sessionId);
}

function subscribe(listener: () => void): () => void {
  listeners.add(listener);
  return () => {
    listeners.delete(listener);
  };
}

function getSnapshot(): ReadonlySet<string> {
  return generatingSessionIds;
}

export function useGeneratingSessionTitles(): ReadonlySet<string> {
  return useSyncExternalStore(subscribe, getSnapshot, getSnapshot);
}

export function useIsSessionTitleGenerating(sessionId: string | null): boolean {
  const generating = useGeneratingSessionTitles();
  return sessionId != null && generating.has(sessionId);
}
