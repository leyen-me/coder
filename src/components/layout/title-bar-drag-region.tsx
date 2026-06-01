import { isTauri } from "@tauri-apps/api/core";
import { getCurrentWindow } from "@tauri-apps/api/window";
import type { MouseEvent } from "react";

export function TitleBarDragRegion() {
  const handleMouseDown = (event: MouseEvent<HTMLDivElement>) => {
    if (!isTauri() || event.button !== 0) {
      return;
    }

    const appWindow = getCurrentWindow();
    if (event.detail === 2) {
      void appWindow.toggleMaximize();
      return;
    }

    void appWindow.startDragging();
  };

  return (
    <div
      className="min-w-0 flex-1 self-stretch"
      data-tauri-drag-region
      onMouseDown={handleMouseDown}
    />
  );
}
