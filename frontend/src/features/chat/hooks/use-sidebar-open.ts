import { useCallback, useState } from "react";

import { MOBILE_BREAKPOINT } from "@/hooks/use-mobile";

import { readSidebarOpen, writeSidebarOpen } from "./sidebar-storage";

export function toggleSidebarOpen(isOpen: boolean): boolean {
  return !isOpen;
}

function readInitialSidebarOpen(): boolean {
  if (typeof window !== "undefined" && window.innerWidth < MOBILE_BREAKPOINT) {
    return false;
  }
  return readSidebarOpen(true);
}

/** Manages shell sidebar visibility for layout chrome and chat navigation. */
export function useSidebarOpen() {
  const [isOpen, setIsOpen] = useState(() => readInitialSidebarOpen());

  const setOpen = useCallback((open: boolean) => {
    setIsOpen(open);
    writeSidebarOpen(open);
  }, []);

  const toggle = useCallback(() => {
    setIsOpen((current) => {
      const next = toggleSidebarOpen(current);
      writeSidebarOpen(next);
      return next;
    });
  }, []);

  return { isOpen, toggle, setOpen } as const;
}
