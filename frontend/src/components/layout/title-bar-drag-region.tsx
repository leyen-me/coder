import type { MouseEvent } from "react";

import { cn } from "@/lib/utils";

type TitleBarDragRegionProps = {
  className?: string;
};

export function TitleBarDragRegion({ className }: TitleBarDragRegionProps) {
  const onMouseDown = (_event: MouseEvent<HTMLDivElement>) => {
    // Title bar drag is only available in the desktop app.
  };

  return (
    <div
      className={cn("min-w-0 flex-1 self-stretch", className)}
      onMouseDown={onMouseDown}
    />
  );
}
