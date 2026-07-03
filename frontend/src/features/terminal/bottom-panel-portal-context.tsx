"use client";

import {
  createContext,
  useCallback,
  useContext,
  useMemo,
  useRef,
  useState,
  type ReactNode,
} from "react";

type BottomPanelPortalContextValue = {
  slotElement: HTMLElement | null;
  registerSlot: (id: number, element: HTMLElement) => void;
  unregisterSlot: (id: number) => void;
};

const BottomPanelPortalContext =
  createContext<BottomPanelPortalContextValue | null>(null);

let nextSlotId = 0;

export function createBottomPanelSlotId(): number {
  nextSlotId += 1;
  return nextSlotId;
}

export function BottomPanelPortalProvider({ children }: { children: ReactNode }) {
  const activeIdRef = useRef(0);
  const [slotElement, setSlotElement] = useState<HTMLElement | null>(null);

  const registerSlot = useCallback((id: number, element: HTMLElement) => {
    activeIdRef.current = id;
    setSlotElement(element);
  }, []);

  const unregisterSlot = useCallback((id: number) => {
    if (activeIdRef.current !== id) {
      return;
    }

    activeIdRef.current = 0;
    setSlotElement(null);
  }, []);

  const value = useMemo(
    () => ({
      slotElement,
      registerSlot,
      unregisterSlot,
    }),
    [registerSlot, slotElement, unregisterSlot]
  );

  return (
    <BottomPanelPortalContext.Provider value={value}>
      {children}
    </BottomPanelPortalContext.Provider>
  );
}

export function useBottomPanelPortal() {
  const context = useContext(BottomPanelPortalContext);
  if (!context) {
    throw new Error(
      "useBottomPanelPortal must be used within BottomPanelPortalProvider"
    );
  }
  return context;
}
