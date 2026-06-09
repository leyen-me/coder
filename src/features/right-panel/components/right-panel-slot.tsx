"use client";

import { useLayoutEffect, type ReactNode } from "react";
import { usePanelRef } from "react-resizable-panels";

import {
  ResizableHandle,
  ResizablePanel,
  ResizablePanelGroup,
} from "@/components/ui/resizable";

import { useRightPanel } from "../right-panel-context";
import { RightPanel } from "./right-panel";

const MAIN_CONTENT_DEFAULT_SIZE = 72;
const RIGHT_PANEL_DEFAULT_SIZE = 28;
const RIGHT_PANEL_MIN_SIZE = 18;

type RightPanelSlotProps = {
  children: ReactNode;
  workspaceDir: string | null;
};

/** Reserves main-column space for the right-side workbench panel. */
export function RightPanelSlot({
  children,
  workspaceDir,
}: RightPanelSlotProps) {
  const { isOpen: isRightPanelOpen } = useRightPanel();
  const rightPanelRef = usePanelRef();

  useLayoutEffect(() => {
    const panel = rightPanelRef.current;
    if (!panel) {
      return;
    }

    if (isRightPanelOpen) {
      panel.expand();
      return;
    }

    if (panel.isCollapsed()) {
      panel.resize(RIGHT_PANEL_DEFAULT_SIZE);
    }

    panel.collapse();
  }, [isRightPanelOpen, rightPanelRef]);

  return (
    <ResizablePanelGroup className="min-h-0 flex-1" orientation="horizontal">
      <ResizablePanel
        defaultSize={MAIN_CONTENT_DEFAULT_SIZE}
        id="main-column-content"
        minSize={40}
      >
        <div className="flex h-full min-h-0 flex-col overflow-hidden">
          {children}
        </div>
      </ResizablePanel>
      {isRightPanelOpen ? <ResizableHandle withHandle /> : null}
      <ResizablePanel
        collapsedSize={0}
        collapsible
        defaultSize={RIGHT_PANEL_DEFAULT_SIZE}
        id="right-panel-slot"
        minSize={RIGHT_PANEL_MIN_SIZE}
        panelRef={rightPanelRef}
      >
        <div
          aria-hidden={!isRightPanelOpen}
          className="h-full min-h-0 overflow-hidden"
        >
          <RightPanel workspaceDir={workspaceDir} />
        </div>
      </ResizablePanel>
    </ResizablePanelGroup>
  );
}
