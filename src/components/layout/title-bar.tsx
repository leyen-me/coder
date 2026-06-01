import { ArrowLeft, ArrowRight, PanelLeft } from "lucide-react";

import { Button } from "@/components/ui/button";
import {
  Tooltip,
  TooltipContent,
  TooltipTrigger,
} from "@/components/ui/tooltip";
import { WindowControls } from "./window-controls";
import { TitleBarDragRegion } from "./title-bar-drag-region";

export function TitleBar() {
  return (
    <header
      className="flex h-11 shrink-0 select-none items-stretch overflow-hidden border-b bg-background"
      role="banner"
      aria-label="标题栏"
    >
      <div className="flex items-center gap-0.5 self-center pl-2">
        <Tooltip>
          <TooltipTrigger asChild>
            <Button
              type="button"
              variant="ghost"
              size="icon-sm"
              className="text-muted-foreground"
              aria-label="切换侧栏"
            >
              <PanelLeft className="size-4" />
            </Button>
          </TooltipTrigger>
          <TooltipContent side="bottom">切换侧栏</TooltipContent>
        </Tooltip>
        <Tooltip>
          <TooltipTrigger asChild>
            <Button
              type="button"
              variant="ghost"
              size="icon-sm"
              className="text-muted-foreground"
              aria-label="后退"
            >
              <ArrowLeft className="size-4" />
            </Button>
          </TooltipTrigger>
          <TooltipContent side="bottom">后退</TooltipContent>
        </Tooltip>
        <Tooltip>
          <TooltipTrigger asChild>
            <Button
              type="button"
              variant="ghost"
              size="icon-sm"
              className="text-muted-foreground"
              aria-label="前进"
            >
              <ArrowRight className="size-4" />
            </Button>
          </TooltipTrigger>
          <TooltipContent side="bottom">前进</TooltipContent>
        </Tooltip>
      </div>

      <TitleBarDragRegion />

      <WindowControls />
    </header>
  );
}
