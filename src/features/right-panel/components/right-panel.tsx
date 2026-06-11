"use client";

import { FileTreePanel } from "./file-tree-panel";

type RightPanelProps = {
  workspaceDir: string | null;
};

export function RightPanel({ workspaceDir }: RightPanelProps) {
  return (
    <div className="flex h-full min-h-0 flex-col border-l bg-background">
      <FileTreePanel workspaceDir={workspaceDir} />
    </div>
  );
}
