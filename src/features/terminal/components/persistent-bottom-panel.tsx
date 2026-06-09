"use client";

import { useLayoutEffect, useRef } from "react";

import { cn } from "@/lib/utils";

import { useBottomPanel } from "../bottom-panel-context";
import { useBottomPanelPortal } from "../bottom-panel-portal-context";
import { BottomPanel } from "./bottom-panel";

type PersistentBottomPanelProps = {
  workspaceDir: string | null;
};

/**
 * Keeps the terminal mounted in a fixed host and aligns it to the active
 * main-column slot so sidebars stay full height.
 */
export function PersistentBottomPanel({
  workspaceDir,
}: PersistentBottomPanelProps) {
  const { slotElement } = useBottomPanelPortal();
  const { isOpen: isBottomPanelOpen } = useBottomPanel();
  const hostRef = useRef<HTMLDivElement>(null);

  useLayoutEffect(() => {
    const host = hostRef.current;
    if (!host) {
      return;
    }

    if (!slotElement) {
      host.style.display = "none";
      return;
    }

    const syncPosition = () => {
      const rect = slotElement.getBoundingClientRect();
      host.style.display = "flex";
      host.style.top = `${rect.top}px`;
      host.style.left = `${rect.left}px`;
      host.style.width = `${rect.width}px`;
      host.style.height = `${rect.height}px`;
    };

    syncPosition();

    const resizeObserver = new ResizeObserver(syncPosition);
    resizeObserver.observe(slotElement);
    window.addEventListener("resize", syncPosition);

    return () => {
      resizeObserver.disconnect();
      window.removeEventListener("resize", syncPosition);
    };
  }, [slotElement]);

  return (
    <div
      ref={hostRef}
      aria-hidden={!isBottomPanelOpen}
      className={cn(
        "fixed z-20 min-h-0 flex-col overflow-hidden",
        !slotElement &&
          "pointer-events-none invisible left-[-9999px] top-0 h-px w-px"
      )}
    >
      <BottomPanel workspaceDir={workspaceDir} />
    </div>
  );
}
