import type { MouseEvent } from "react";

import { useAppWindow } from "@/lib/tauri/use-app-window";
import { handleTitleBarMouseDown } from "@/lib/tauri/title-bar-handlers";
import { cn } from "@/lib/utils";

type TitleBarDragRegionProps = {
  className?: string;
};

export function TitleBarDragRegion({ className }: TitleBarDragRegionProps) {
  const appWindow = useAppWindow();

  const onMouseDown = (event: MouseEvent<HTMLDivElement>) => {
    if (!appWindow) {
      return;
    }

    handleTitleBarMouseDown(event, appWindow);
  };

  return (
    <div
      className={cn("min-w-0 flex-1 self-stretch", className)}
      onMouseDown={onMouseDown}
    />
  );
}
