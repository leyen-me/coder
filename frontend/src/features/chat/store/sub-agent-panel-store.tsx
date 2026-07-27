import {
  createContext,
  useCallback,
  useContext,
  useMemo,
  useState,
  type ReactNode,
} from "react";

/**
 * Lightweight shared state for the right-hand SubAgent panel.
 *
 * Only ONE child (SubAgent) session is shown at a time. Clicking a different
 * SubAgent Label replaces the current one — the old `ChatSessionView` unmounts
 * and the new one mounts (via React `key`). This keeps the panel a pure
 * read-only viewer: no tab list, no multi-session juggling.
 *
 * A SubAgent is a normal session, so the mounted child runs its own
 * `useSessionData` / `resumeSessionTask` / reconcile, fully isolated by
 * `sessionId`.
 */
type SubAgentPanelContextValue = {
  childSessionId: string | null;
  openChild: (sessionId: string) => void;
  closeChild: () => void;
  /** Clear the open panel — used when the parent session changes. */
  reset: () => void;
};

const SubAgentPanelContext = createContext<SubAgentPanelContextValue | null>(null);

export function SubAgentPanelProvider({ children }: { children: ReactNode }) {
  const [childSessionId, setChildSessionId] = useState<string | null>(null);

  const openChild = useCallback((sessionId: string) => {
    setChildSessionId(sessionId);
  }, []);

  const closeChild = useCallback(() => {
    setChildSessionId(null);
  }, []);

  const reset = useCallback(() => {
    setChildSessionId(null);
  }, []);

  const value = useMemo(
    () => ({ childSessionId, openChild, closeChild, reset }),
    [childSessionId, openChild, closeChild, reset],
  );

  return (
    <SubAgentPanelContext.Provider value={value}>
      {children}
    </SubAgentPanelContext.Provider>
  );
}

export function useSubAgentPanel(): SubAgentPanelContextValue {
  const ctx = useContext(SubAgentPanelContext);
  if (!ctx) {
    throw new Error(
      "useSubAgentPanel must be used within a SubAgentPanelProvider",
    );
  }
  return ctx;
}
