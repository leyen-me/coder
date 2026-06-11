"use client";

import {
  createContext,
  useCallback,
  useContext,
  useMemo,
  useState,
  type ReactNode,
} from "react";

export type BottomPanelTab = "terminal" | "processes";

type BottomPanelContextValue = {
  isOpen: boolean;
  activeTab: BottomPanelTab;
  toggle: () => void;
  setOpen: (open: boolean) => void;
  setActiveTab: (tab: BottomPanelTab) => void;
  openTab: (tab: BottomPanelTab) => void;
  toggleTab: (tab: BottomPanelTab) => void;
};

const BottomPanelContext = createContext<BottomPanelContextValue | null>(null);

export function BottomPanelProvider({ children }: { children: ReactNode }) {
  const [isOpen, setIsOpen] = useState(false);
  const [activeTab, setActiveTab] = useState<BottomPanelTab>("terminal");

  const toggle = useCallback(() => {
    setIsOpen((current) => !current);
  }, []);

  const openTab = useCallback((tab: BottomPanelTab) => {
    setActiveTab(tab);
    setIsOpen(true);
  }, []);

  const toggleTab = useCallback((tab: BottomPanelTab) => {
    if (isOpen && activeTab === tab) {
      setIsOpen(false);
      return;
    }

    setActiveTab(tab);
    setIsOpen(true);
  }, [activeTab, isOpen]);

  const value = useMemo(
    () => ({
      isOpen,
      activeTab,
      toggle,
      setOpen: setIsOpen,
      setActiveTab,
      openTab,
      toggleTab,
    }),
    [activeTab, isOpen, openTab, toggle, toggleTab]
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
