"use client";

import { useEffect, useLayoutEffect, useRef, type ReactNode } from "react";
import { usePanelRef } from "react-resizable-panels";

import {
  ResizableHandle,
  ResizablePanel,
  ResizablePanelGroup,
} from "@/components/ui/resizable";
import { cn } from "@/lib/utils";

import { useBottomPanel } from "../bottom-panel-context";
import {
  createBottomPanelSlotId,
  useBottomPanelPortal,
} from "../bottom-panel-portal-context";

const BOTTOM_PANEL_GROUP_ID = "coder-bottom-panel";

type BottomPanelSlotProps = {
  children: ReactNode;
};

/** Reserves main-column space for the terminal and registers a layout anchor. */
export function BottomPanelSlot({ children }: BottomPanelSlotProps) {
  const { isOpen: isBottomPanelOpen } = useBottomPanel();
  const { registerSlot, unregisterSlot } = useBottomPanelPortal();
  const slotIdRef = useRef(createBottomPanelSlotId());
  const slotRef = useRef<HTMLDivElement>(null);
  const bottomPanelRef = usePanelRef();

  useLayoutEffect(() => {
    const element = slotRef.current;
    if (!element) {
      return;
    }

    registerSlot(slotIdRef.current, element);
    return () => unregisterSlot(slotIdRef.current);
  }, [registerSlot, unregisterSlot]);

  useEffect(() => {
    const panel = bottomPanelRef.current;
    if (!panel) {
      return;
    }

    if (isBottomPanelOpen) {
      panel.expand();
      return;
    }

    panel.collapse();
  }, [bottomPanelRef, isBottomPanelOpen]);

  return (
    <ResizablePanelGroup
      autoSave={BOTTOM_PANEL_GROUP_ID}
      className="min-h-0 flex-1"
      orientation="vertical"
    >
      <ResizablePanel defaultSize={60} id="main-content" minSize={35}>
        <div className="flex min-h-0 flex-col overflow-hidden">{children}</div>
      </ResizablePanel>
      {isBottomPanelOpen ? <ResizableHandle withHandle /> : null}
      <ResizablePanel
        collapsedSize={0}
        collapsible
        defaultSize={40}
        id="bottom-panel-slot"
        minSize={20}
        panelRef={bottomPanelRef}
      >
        <div
          ref={slotRef}
          aria-hidden={!isBottomPanelOpen}
          className={cn(
            "h-full min-h-0 overflow-hidden",
            isBottomPanelOpen && "border-t"
          )}
        />
      </ResizablePanel>
    </ResizablePanelGroup>
  );
}
