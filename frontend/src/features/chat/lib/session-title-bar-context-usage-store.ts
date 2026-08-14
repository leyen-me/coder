import { useSyncExternalStore } from "react";

import type { SessionContextUsage } from "./estimate-session-context-usage";

/**
 * 把会话页计算出的上下文用量共享给顶部标题栏。
 * 标题栏渲染在路由外层，因此用模块级 store 而不是 props 传递。
 */
const values = new Map<string, SessionContextUsage | null>();
const listeners = new Set<() => void>();

function emit() {
  for (const listener of listeners) {
    listener();
  }
}

export function setSessionTitleBarContextUsage(
  sessionId: string,
  contextUsage: SessionContextUsage | null,
) {
  if (values.get(sessionId) === contextUsage) {
    return;
  }
  if (contextUsage === null) {
    values.delete(sessionId);
  } else {
    values.set(sessionId, contextUsage);
  }
  emit();
}

export function getSessionTitleBarContextUsage(
  sessionId: string | null,
): SessionContextUsage | null {
  if (!sessionId) {
    return null;
  }
  return values.get(sessionId) ?? null;
}

function subscribe(listener: () => void) {
  listeners.add(listener);
  return () => {
    listeners.delete(listener);
  };
}

export function useSessionTitleBarContextUsage(sessionId: string | null) {
  return useSyncExternalStore(
    subscribe,
    () => getSessionTitleBarContextUsage(sessionId),
    () => getSessionTitleBarContextUsage(sessionId),
  );
}
