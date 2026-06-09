"use client";

import { TerminalTab } from "./terminal-tab";

type BottomPanelProps = {
  workspaceDir: string | null;
};

export function BottomPanel({ workspaceDir }: BottomPanelProps) {
  return (
    <div className="flex h-full min-h-0 flex-col border-t bg-background">
      <TerminalTab workspaceDir={workspaceDir} />
    </div>
  );
}
