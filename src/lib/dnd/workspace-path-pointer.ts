import type { PointerEvent as ReactPointerEvent } from "react";

import {
  beginWorkspacePathDrag,
  endWorkspacePathDrag,
} from "./workspace-path";

const DRAG_THRESHOLD_PX = 6;

type PointerSession = {
  path: string;
  startX: number;
  startY: number;
  dragging: boolean;
};

type DropTarget = {
  getElement: () => HTMLElement | null;
  getRect: () => DOMRect;
  onDrop: (path: string) => void;
};

let pointerSession: PointerSession | null = null;
let suppressNextTreeClick = false;
const dropTargets = new Map<symbol, DropTarget>();
let listenersAttached = false;

function attachDocumentListeners(): void {
  if (listenersAttached) {
    return;
  }

  listenersAttached = true;
  document.addEventListener("pointermove", handleDocumentPointerMove);
  document.addEventListener("pointerup", handleDocumentPointerUp);
  document.addEventListener("pointercancel", handleDocumentPointerUp);
}

function detachDocumentListenersIfIdle(): void {
  if (pointerSession || dropTargets.size > 0) {
    return;
  }

  document.removeEventListener("pointermove", handleDocumentPointerMove);
  document.removeEventListener("pointerup", handleDocumentPointerUp);
  document.removeEventListener("pointercancel", handleDocumentPointerUp);
  listenersAttached = false;
}

function handleDocumentPointerMove(event: PointerEvent): void {
  if (!pointerSession) {
    return;
  }

  if (!pointerSession.dragging) {
    const dx = event.clientX - pointerSession.startX;
    const dy = event.clientY - pointerSession.startY;
    if (Math.hypot(dx, dy) < DRAG_THRESHOLD_PX) {
      return;
    }

    pointerSession.dragging = true;
    beginWorkspacePathDrag(pointerSession.path);
    document.body.dataset.workspacePathDrag = "true";
  }

  updateDropTargetHover(event.clientX, event.clientY);
}

function updateDropTargetHover(x: number, y: number): void {
  let hoveredTarget: DropTarget | null = null;

  for (const target of dropTargets.values()) {
    if (isPointInsideRect(x, y, target.getRect())) {
      hoveredTarget = target;
      break;
    }
  }

  for (const target of dropTargets.values()) {
    const element = target.getElement();
    if (!element) {
      continue;
    }

    if (target === hoveredTarget) {
      element.dataset.workspacePathDropHover = "true";
    } else {
      delete element.dataset.workspacePathDropHover;
    }
  }
}

function clearDropTargetHover(): void {
  for (const target of dropTargets.values()) {
    const element = target.getElement();
    if (element) {
      delete element.dataset.workspacePathDropHover;
    }
  }
}

function isPointInsideRect(
  x: number,
  y: number,
  rect: DOMRect
): boolean {
  return (
    x >= rect.left &&
    x <= rect.right &&
    y >= rect.top &&
    y <= rect.bottom
  );
}

function handleDocumentPointerUp(event: PointerEvent): void {
  if (!pointerSession) {
    return;
  }

  const { path, dragging } = pointerSession;
  pointerSession = null;
  delete document.body.dataset.workspacePathDrag;
  clearDropTargetHover();

  if (!dragging) {
    return;
  }

  endWorkspacePathDrag();
  suppressNextTreeClick = true;

  for (const target of dropTargets.values()) {
    const rect = target.getRect();
    if (isPointInsideRect(event.clientX, event.clientY, rect)) {
      target.onDrop(path);
      break;
    }
  }
}

export function beginFileTreePointerDrag(
  path: string,
  clientX: number,
  clientY: number
): void {
  attachDocumentListeners();
  pointerSession = {
    dragging: false,
    path,
    startX: clientX,
    startY: clientY,
  };
}

export function registerWorkspacePathDropTarget(
  getElement: () => HTMLElement | null,
  getRect: () => DOMRect,
  onDrop: (path: string) => void
): () => void {
  attachDocumentListeners();
  const id = Symbol("workspace-path-drop-target");
  dropTargets.set(id, { getElement, getRect, onDrop });

  return () => {
    const element = getElement();
    if (element) {
      delete element.dataset.workspacePathDropHover;
    }
    dropTargets.delete(id);
    detachDocumentListenersIfIdle();
  };
}

export function shouldSuppressFileTreeClick(): boolean {
  if (!suppressNextTreeClick) {
    return false;
  }

  suppressNextTreeClick = false;
  return true;
}

export function createFileTreePointerDragProps(path: string): {
  onPointerDown: (event: ReactPointerEvent) => void;
} {
  return {
    onPointerDown: (event) => {
      if (event.button !== 0) {
        return;
      }

      beginFileTreePointerDrag(path, event.clientX, event.clientY);
    },
  };
}

/** @internal Resets module state between tests. */
export function resetWorkspacePathPointerStateForTests(): void {
  pointerSession = null;
  suppressNextTreeClick = false;
  dropTargets.clear();
  if (typeof document !== "undefined") {
    delete document.body.dataset.workspacePathDrag;
    clearDropTargetHover();
  }
  detachDocumentListenersIfIdle();
}
