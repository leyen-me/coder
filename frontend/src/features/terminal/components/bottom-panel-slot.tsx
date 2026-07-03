"use client";

import { useLayoutEffect, useRef, type ReactNode } from "react";
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

const MAIN_CONTENT_DEFAULT_SIZE = 60;
const BOTTOM_PANEL_DEFAULT_SIZE = 40;
const BOTTOM_PANEL_MIN_SIZE = 20;

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

  useLayoutEffect(() => {
    const panel = bottomPanelRef.current;
    if (!panel) {
      return;
    }

    if (isBottomPanelOpen) {
      panel.expand();
      return;
    }

    // expand() restores pre-collapse size; if the panel was already collapsed
    // (size 0) that size was never recorded and expand() falls back to minSize.
    if (panel.isCollapsed()) {
      panel.resize(BOTTOM_PANEL_DEFAULT_SIZE);
    }

    panel.collapse();
  }, [bottomPanelRef, isBottomPanelOpen]);

  return (
    <ResizablePanelGroup
      className="min-h-0 flex-1"
      orientation="vertical"
    >
      <ResizablePanel
        defaultSize={MAIN_CONTENT_DEFAULT_SIZE}
        id="main-content"
        minSize={35}
      >
        <div className="flex h-full min-h-0 flex-col overflow-hidden">
          {children}
        </div>
      </ResizablePanel>
      {isBottomPanelOpen ? <ResizableHandle withHandle /> : null}
      <ResizablePanel
        collapsedSize={0}
        collapsible
        defaultSize={BOTTOM_PANEL_DEFAULT_SIZE}
        id="bottom-panel-slot"
        minSize={BOTTOM_PANEL_MIN_SIZE}
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
