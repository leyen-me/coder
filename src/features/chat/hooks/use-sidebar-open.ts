import { useCallback, useState } from "react";

export function toggleSidebarOpen(isOpen: boolean): boolean {
  return !isOpen;
}

/** Manages shell sidebar visibility for layout chrome and chat navigation. */
export function useSidebarOpen(initialOpen = true) {
  const [isOpen, setIsOpen] = useState(initialOpen);

  const toggle = useCallback(() => {
    setIsOpen((current) => toggleSidebarOpen(current));
  }, []);

  return { isOpen, toggle, setIsOpen } as const;
}
