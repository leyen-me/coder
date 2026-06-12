import type { CSSProperties, ReactNode } from "react";

import { cn } from "@/lib/utils";

import {
  FLOATING_SHELL_NAV_WIDTH_PX,
  TITLE_BAR_CLASS,
} from "./constants";
import { TitleBarDragRegion } from "./title-bar-drag-region";
import { WindowControls } from "./window-controls";

type ContentTitleBarProps = {
  leading?: ReactNode;
  trailing?: ReactNode;
  /** When the sidebar is collapsed, reserve space for floating shell nav buttons. */
  reserveFloatingNavSpace?: boolean;
};

/** Drag region, optional page chrome, and window controls for the main column. */
export function ContentTitleBar({
  leading,
  trailing,
  reserveFloatingNavSpace = false,
}: ContentTitleBarProps) {
  const hasPageChrome = leading != null || trailing != null;

  const mainChromeStyle: CSSProperties | undefined = reserveFloatingNavSpace
    ? { paddingLeft: FLOATING_SHELL_NAV_WIDTH_PX }
    : undefined;

  return (
    <div
      className={cn(
        "flex",
        TITLE_BAR_CLASS,
        "shrink-0 items-stretch overflow-hidden border-b border-border",
      )}
    >
      <div
        className="flex min-w-0 flex-1 items-stretch"
        style={mainChromeStyle}
      >
        {leading ? (
          <div className="flex max-w-[min(50%,16rem)] shrink-0 items-center pl-4 pr-2 sm:max-w-xs md:max-w-sm">
            {leading}
          </div>
        ) : null}
        <TitleBarDragRegion
          className={cn(hasPageChrome && "min-w-0 flex-1")}
        />
      </div>

      {trailing ? (
        <>
          <div className="flex shrink-0 items-center gap-1 px-1">{trailing}</div>
          <div
            role="separator"
            aria-orientation="vertical"
            className="mx-1 h-4 w-px shrink-0 self-center bg-border"
          />
        </>
      ) : null}

      <WindowControls />
    </div>
  );
}
