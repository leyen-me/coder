import { useAppWindow } from "@/lib/tauri/use-app-window";
import { handleTitleBarMouseDown } from "@/lib/tauri/title-bar-handlers";
import type { MouseEvent } from "react";

export function TitleBarDragRegion() {
  const appWindow = useAppWindow();

  const onMouseDown = (event: MouseEvent<HTMLDivElement>) => {
    if (!appWindow) {
      return;
    }

    handleTitleBarMouseDown(event, appWindow);
  };

  return (
    <div
      className="min-w-0 flex-1 self-stretch"
      onMouseDown={onMouseDown}
    />
  );
}
