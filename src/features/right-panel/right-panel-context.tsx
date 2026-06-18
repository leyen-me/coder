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

export type PlanBuildActions = {
  isRunning: boolean;
  isBuildPending: boolean;
  onBuild: () => void;
};

type RightPanelContextValue = {
  isOpen: boolean;
  toggle: () => void;
  toggleExplorer: () => void;
  setOpen: (open: boolean) => void;
  /* Source Control tab */
  isSourceControlTabActive: boolean;
  openSourceControlTab: () => void;
  deactivateSourceControlTab: () => void;
  /** Incremented by the file watcher when .git/ changes occur */
  gitRefreshTick: number;
  setGitRefreshTick: React.Dispatch<React.SetStateAction<number>>;
};

const RightPanelContext = createContext<RightPanelContextValue | null>(null);

export function RightPanelProvider({ children }: { children: ReactNode }) {
  const { pathname } = useLocation();
  const [isOpen, setIsOpen] = useState(false);
  const [isSourceControlTabActive, setIsSourceControlTabActive] = useState(false);
  const [gitRefreshTick, setGitRefreshTick] = useState(0);

  useEffect(() => {
    if (!isChatRoute(pathname)) {
      setIsOpen(false);
      setIsSourceControlTabActive(false);
    }
  }, [pathname]);

  const toggle = useCallback(() => {
    setIsOpen((current) => !current);
  }, []);

  const toggleExplorer = useCallback(() => {
    setIsOpen((current) => {
      if (current && !isSourceControlTabActive) {
        return false;
      }

      setIsSourceControlTabActive(false);
      return true;
    });
  }, [isSourceControlTabActive]);

  const openSourceControlTab = useCallback(() => {
    setIsSourceControlTabActive(true);
    setIsOpen(true);
  }, []);

  const deactivateSourceControlTab = useCallback(() => {
    setIsSourceControlTabActive(false);
  }, []);

  const value = useMemo(
    () => ({
      isOpen,
      toggle,
      toggleExplorer,
      setOpen: setIsOpen,
      isSourceControlTabActive,
      openSourceControlTab,
      deactivateSourceControlTab,
      gitRefreshTick,
      setGitRefreshTick,
    }),
    [
      deactivateSourceControlTab,
      gitRefreshTick,
      isOpen,
      isSourceControlTabActive,
      openSourceControlTab,
      toggle,
      toggleExplorer,
    ]
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
