"use client";

import {
  createContext,
  useCallback,
  useContext,
  useMemo,
  useState,
  type ReactNode,
} from "react";

type BottomPanelContextValue = {
  isOpen: boolean;
  toggle: () => void;
  setOpen: (open: boolean) => void;
};

const BottomPanelContext = createContext<BottomPanelContextValue | null>(null);

export function BottomPanelProvider({ children }: { children: ReactNode }) {
  const [isOpen, setIsOpen] = useState(false);

  const toggle = useCallback(() => {
    setIsOpen((current) => !current);
  }, []);

  const value = useMemo(
    () => ({
      isOpen,
      toggle,
      setOpen: setIsOpen,
    }),
    [isOpen, toggle]
  );

  return (
    <BottomPanelContext.Provider value={value}>
      {children}
    </BottomPanelContext.Provider>
  );
}

export function useBottomPanel() {
  const context = useContext(BottomPanelContext);
  if (!context) {
    throw new Error("useBottomPanel must be used within BottomPanelProvider");
  }
  return context;
}
