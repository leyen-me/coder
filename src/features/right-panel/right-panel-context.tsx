"use client";

import { useEffect } from "react";
import {
  createContext,
  useCallback,
  useContext,
  useMemo,
  useState,
  type ReactNode,
} from "react";
import { useLocation } from "react-router-dom";

import { isChatRoute } from "@/app/paths";

type RightPanelContextValue = {
  isOpen: boolean;
  toggle: () => void;
  setOpen: (open: boolean) => void;
};

const RightPanelContext = createContext<RightPanelContextValue | null>(null);

export function RightPanelProvider({ children }: { children: ReactNode }) {
  const { pathname } = useLocation();
  const [isOpen, setIsOpen] = useState(false);

  useEffect(() => {
    if (!isChatRoute(pathname)) {
      setIsOpen(false);
    }
  }, [pathname]);

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
    <RightPanelContext.Provider value={value}>
      {children}
    </RightPanelContext.Provider>
  );
}

export function useRightPanel() {
  const context = useContext(RightPanelContext);
  if (!context) {
    throw new Error("useRightPanel must be used within RightPanelProvider");
  }
  return context;
}
