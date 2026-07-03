"use client";

import { useBottomPanel } from "../bottom-panel-context";
import { TerminalTab } from "./terminal-tab";

type BottomPanelProps = {
  workspaceDir: string | null;
};

export function BottomPanel({ workspaceDir }: BottomPanelProps) {
  const { setOpen } = useBottomPanel();

  return (
    <div className="flex h-full min-h-0 flex-col border-t bg-background">
      <div className="min-h-0 flex-1">
        <TerminalTab
          workspaceDir={workspaceDir}
          onHide={() => setOpen(false)}
        />
      </div>
    </div>
  );
}
