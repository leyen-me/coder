import type { ReactNode } from "react";

import {
  ResizableHandle,
  ResizablePanel,
  ResizablePanelGroup,
} from "@/components/ui/resizable";
import { BottomPanel } from "@/features/terminal/components/bottom-panel";
import { useBottomPanel } from "@/features/terminal/bottom-panel-context";

type ChatLayoutWithBottomPanelProps = {
  workspaceDir: string | null;
  children: ReactNode;
};

export function ChatLayoutWithBottomPanel({
  workspaceDir,
  children,
}: ChatLayoutWithBottomPanelProps) {
  const { isOpen: isBottomPanelOpen } = useBottomPanel();

  if (!isBottomPanelOpen) {
    return (
      <div className="flex min-h-0 flex-1 flex-col overflow-hidden">
        {children}
      </div>
    );
  }

  return (
    <ResizablePanelGroup className="min-h-0 flex-1" orientation="vertical">
      <ResizablePanel defaultSize={60} minSize={35}>
        <div className="flex h-full min-h-0 flex-col overflow-hidden">
          {children}
        </div>
      </ResizablePanel>
      <ResizableHandle withHandle />
      <ResizablePanel defaultSize={40} minSize={20}>
        <BottomPanel workspaceDir={workspaceDir} />
      </ResizablePanel>
    </ResizablePanelGroup>
  );
}
