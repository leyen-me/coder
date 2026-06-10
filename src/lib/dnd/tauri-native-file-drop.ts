import type { DragDropEvent } from "@tauri-apps/api/webview";

export function physicalDropPositionToLogical(
  position: { x: number; y: number },
  scaleFactor: number
): { x: number; y: number } {
  if (scaleFactor <= 0) {
    return { x: position.x, y: position.y };
  }

  return {
    x: position.x / scaleFactor,
    y: position.y / scaleFactor,
  };
}

export function isPointInsideClientRect(
  x: number,
  y: number,
  rect: DOMRect
): boolean {
  return x >= rect.left && x <= rect.right && y >= rect.top && y <= rect.bottom;
}

function isDropPointOverElement(
  element: HTMLElement,
  x: number,
  y: number
): boolean {
  const rect = element.getBoundingClientRect();

  if (isPointInsideClientRect(x, y, rect)) {
    return true;
  }

  const hit = document.elementFromPoint(x, y);
  return Boolean(hit && element.contains(hit));
}

export function isDropOverElement(
  element: HTMLElement | null,
  position: { x: number; y: number },
  scaleFactor: number
): boolean {
  if (!element) {
    return false;
  }

  const logical = physicalDropPositionToLogical(position, scaleFactor);
  if (isDropPointOverElement(element, logical.x, logical.y)) {
    return true;
  }

  // Some platforms already report logical coordinates in the drag-drop event.
  return isDropPointOverElement(element, position.x, position.y);
}

export function setNativeFileDropHover(
  element: HTMLElement | null,
  hovering: boolean
): void {
  if (!element) {
    return;
  }

  if (hovering) {
    element.dataset.workspacePathDropHover = "true";
  } else {
    delete element.dataset.workspacePathDropHover;
  }
}

export function dragDropEventHasPosition(
  payload: DragDropEvent
): payload is Extract<DragDropEvent, { position: { x: number; y: number } }> {
  return "position" in payload;
}
