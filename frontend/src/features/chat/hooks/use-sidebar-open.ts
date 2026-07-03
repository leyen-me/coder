import { useCallback, useState } from "react";

import { readSidebarOpen, writeSidebarOpen } from "./sidebar-storage";

export function toggleSidebarOpen(isOpen: boolean): boolean {
  return !isOpen;
}

/** Manages shell sidebar visibility for layout chrome and chat navigation. */
export function useSidebarOpen() {
  const [isOpen, setIsOpen] = useState(() => readSidebarOpen(true));

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
