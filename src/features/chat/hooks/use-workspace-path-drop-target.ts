import { useEffect, type RefObject } from "react";

import { registerWorkspacePathDropTarget } from "@/lib/dnd/workspace-path-pointer";

export function useWorkspacePathDropTarget(
  ref: RefObject<HTMLElement | null>,
  onDrop: (path: string) => void
): void {
  useEffect(() => {
    return registerWorkspacePathDropTarget(
      () => ref.current,
      () => ref.current?.getBoundingClientRect() ?? new DOMRect(),
      onDrop
    );
  }, [onDrop, ref]);
}
