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
import { subscribePlanFileUpdated } from "@/features/plan/plan-events";

export type PlanBuildActions = {
  isRunning: boolean;
  isBuildPending: boolean;
  onBuild: () => void;
};

type RightPanelContextValue = {
  isOpen: boolean;
  toggle: () => void;
  setOpen: (open: boolean) => void;
  isPlanTabActive: boolean;
  activePlanName: string | null;
  openPlanPreview: (planName?: string | null) => void;
  deactivatePlanTab: () => void;
  planBuildActions: PlanBuildActions | null;
  setPlanBuildActions: (actions: PlanBuildActions | null) => void;
  planUpdateTick: number;
};

const RightPanelContext = createContext<RightPanelContextValue | null>(null);

export function RightPanelProvider({ children }: { children: ReactNode }) {
  const { pathname } = useLocation();
  const [isOpen, setIsOpen] = useState(false);
  const [isPlanTabActive, setIsPlanTabActive] = useState(false);
  const [activePlanName, setActivePlanName] = useState<string | null>(null);
  const [planBuildActions, setPlanBuildActions] = useState<PlanBuildActions | null>(
    null
  );
  const [planUpdateTick, setPlanUpdateTick] = useState(0);

  useEffect(() => {
    if (!isChatRoute(pathname)) {
      setIsOpen(false);
      setIsPlanTabActive(false);
      setActivePlanName(null);
      setPlanBuildActions(null);
    }
  }, [pathname]);

  useEffect(() => {
    return subscribePlanFileUpdated((detail) => {
      if (detail.action === "deleted") {
        setActivePlanName((current) =>
          current === detail.name ? null : current
        );
        return;
      }

      setActivePlanName(detail.name);
      setIsPlanTabActive(true);
      setIsOpen(true);
      setPlanUpdateTick((current) => current + 1);
    });
  }, []);

  const toggle = useCallback(() => {
    setIsOpen((current) => !current);
  }, []);

  const openPlanPreview = useCallback((planName?: string | null) => {
    setActivePlanName(planName ?? null);
    setIsPlanTabActive(true);
    setIsOpen(true);
  }, []);

  const deactivatePlanTab = useCallback(() => {
    setIsPlanTabActive(false);
  }, []);

  const value = useMemo(
    () => ({
      isOpen,
      toggle,
      setOpen: setIsOpen,
      isPlanTabActive,
      activePlanName,
      openPlanPreview,
      deactivatePlanTab,
      planBuildActions,
      setPlanBuildActions,
      planUpdateTick,
    }),
    [
      activePlanName,
      deactivatePlanTab,
      isOpen,
      isPlanTabActive,
      openPlanPreview,
      planBuildActions,
      planUpdateTick,
      toggle,
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
