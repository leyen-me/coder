"use client";

import { FileIcon, FolderIcon } from "lucide-react";
import { createPortal } from "react-dom";

import {
  getWorkspacePathDragPreviewOffset,
  useWorkspacePathDragPreview,
} from "@/lib/dnd/workspace-path-pointer";
import { cn } from "@/lib/utils";

export function WorkspacePathDragPreview() {
  const preview = useWorkspacePathDragPreview();

  if (!preview || typeof document === "undefined") {
    return null;
  }

  const offset = getWorkspacePathDragPreviewOffset();

  return createPortal(
    <div
      aria-hidden
      className={cn(
        "pointer-events-none fixed z-[9999] flex max-w-xs items-center gap-2",
        "rounded-xl border border-border/80 bg-popover/95 px-3 py-2",
        "font-mono text-sm text-popover-foreground shadow-lg backdrop-blur-sm",
        "ring-1 ring-primary/15"
      )}
      style={{
        left: preview.x + offset.x,
        top: preview.y + offset.y,
      }}
    >
      {preview.isDir ? (
        <FolderIcon className="size-4 shrink-0 text-blue-500" />
      ) : (
        <FileIcon className="size-4 shrink-0 text-muted-foreground" />
      )}
      <span className="truncate">{preview.name}</span>
    </div>,
    document.body
  );
}
