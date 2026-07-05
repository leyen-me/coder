import type { CSSProperties, ReactNode } from "react";

import { cn } from "@/lib/utils";

import {
  getFloatingShellNavWidthPx,
  TITLE_BAR_CLASS,
} from "./constants";
import { TitleBarDragRegion } from "./title-bar-drag-region";
import { HAS_WINDOW_CONTROLS, WindowControls } from "./window-controls";

type ContentTitleBarProps = {
  leading?: ReactNode;
  trailing?: ReactNode;
  /** When the sidebar is collapsed, reserve space for floating shell nav buttons. */
  reserveFloatingNavSpace?: boolean;
  /** Whether the floating nav includes the search button. */
  showFloatingSearch?: boolean;
};

/** Drag region, optional page chrome, and window controls for the main column. */
export function ContentTitleBar({
  leading,
  trailing,
  reserveFloatingNavSpace = false,
  showFloatingSearch = true,
}: ContentTitleBarProps) {
  const hasPageChrome = leading != null || trailing != null;

  const mainChromeStyle: CSSProperties | undefined = reserveFloatingNavSpace
    ? { paddingLeft: getFloatingShellNavWidthPx(showFloatingSearch) }
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
          <div
            className={cn(
              "flex min-w-0 max-w-[min(50%,12rem)] shrink items-center pr-1 sm:max-w-xs sm:pr-2 md:max-w-sm",
              reserveFloatingNavSpace ? "pl-1" : "pl-2 sm:pl-4",
            )}
          >
            {leading}
          </div>
        ) : null}
        <TitleBarDragRegion
          className={cn(hasPageChrome && "min-w-0 flex-1")}
        />
      </div>

      {trailing ? (
        <>
          <div className="flex min-w-0 shrink items-center gap-0.5 px-0.5 sm:gap-1 sm:px-1">
            {trailing}
          </div>
          {HAS_WINDOW_CONTROLS ? (
            <div
              role="separator"
              aria-orientation="vertical"
              className="mx-1 h-4 w-px shrink-0 self-center bg-border"
            />
          ) : null}
        </>
      ) : null}

      <WindowControls />
    </div>
  );
}
