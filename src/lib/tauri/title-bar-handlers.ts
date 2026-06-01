import type { Window } from "@tauri-apps/api/window";
import type { MouseEvent } from "react";

const PRIMARY_MOUSE_BUTTON = 0;
const DOUBLE_CLICK_DETAIL = 2;

/**
 * Handles title bar pointer interaction for frameless desktop windows.
 *
 * Follows Tauri's recommended pattern: double-click toggles maximize, otherwise
 * start a window drag. Do not combine with `data-tauri-drag-region`, which would
 * trigger a second maximize on double-click.
 *
 * @see https://v2.tauri.app/learn/window-customization/
 */
export function handleTitleBarMouseDown(
  event: MouseEvent<HTMLElement>,
  appWindow: Window,
): void {
  if (event.button !== PRIMARY_MOUSE_BUTTON) {
    return;
  }

  if (event.detail === DOUBLE_CLICK_DETAIL) {
    event.preventDefault();
    void appWindow.toggleMaximize();
    return;
  }

  void appWindow.startDragging();
}

/** Prevents title bar drag handlers from swallowing window control clicks. */
export function stopMouseDownPropagation(event: MouseEvent<HTMLElement>): void {
  event.stopPropagation();
}
