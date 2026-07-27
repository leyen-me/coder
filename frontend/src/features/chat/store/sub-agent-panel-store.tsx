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
 * Unlike a full tab bar, this only tracks which child (SubAgent) sessions are
 * currently open in the side panel and which one is active. A SubAgent is a
 * normal session, so each open child is rendered with its own `ChatSessionView`
 * instance — session isolation is already guaranteed by `sessionId` scoping in
 * `useSessionData` / `resumeSessionTask` / the agent store, so this store does
 * not need to duplicate any of that logic.
 */
type SubAgentPanelContextValue = {
  openChildIds: string[];
  activeChildId: string | null;
  openChild: (sessionId: string) => void;
  closeChild: (sessionId: string) => void;
  setActiveChild: (sessionId: string) => void;
  /** Clear all open panels — used when the parent session changes. */
  reset: () => void;
};

const SubAgentPanelContext = createContext<SubAgentPanelContextValue | null>(null);

export function SubAgentPanelProvider({ children }: { children: ReactNode }) {
  const [openChildIds, setOpenChildIds] = useState<string[]>([]);
  const [activeChildId, setActiveChildId] = useState<string | null>(null);

  const openChild = useCallback((sessionId: string) => {
    setOpenChildIds((ids) =>
      ids.includes(sessionId) ? ids : [...ids, sessionId],
    );
    setActiveChildId(sessionId);
  }, []);

  const closeChild = useCallback((sessionId: string) => {
    setOpenChildIds((ids) => ids.filter((id) => id !== sessionId));
    setActiveChildId((cur) => (cur === sessionId ? null : cur));
  }, []);

  const setActiveChild = useCallback((sessionId: string) => {
    setActiveChildId(sessionId);
  }, []);

  const reset = useCallback(() => {
    setOpenChildIds([]);
    setActiveChildId(null);
  }, []);

  const value = useMemo(
    () => ({ openChildIds, activeChildId, openChild, closeChild, setActiveChild, reset }),
    [openChildIds, activeChildId, openChild, closeChild, setActiveChild, reset],
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
