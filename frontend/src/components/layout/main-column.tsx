import type { ReactNode } from "react";
import { useOutletContext } from "react-router-dom";

import type { ShellOutletContext } from "@/app/shell-outlet-context";
import { useIsMobile } from "@/hooks/use-mobile";

import {
  FLOATING_SHELL_NAV_SINGLE_BUTTON_WIDTH_PX,
  FLOATING_SHELL_NAV_WIDTH_PX,
} from "./constants";
import { ContentTitleBar } from "./content-title-bar";

type MainColumnProps = {
  children: ReactNode;
  titleBarLeading?: ReactNode;
  titleBarTrailing?: ReactNode;
};

/** Right-hand shell column: content title bar plus routed page content. */
export function MainColumn({
  children,
  titleBarLeading,
  titleBarTrailing,
}: MainColumnProps) {
  const { sidebarOpen, showFloatingSearch } =
    useOutletContext<ShellOutletContext>();
  const isMobile = useIsMobile();
  const floatingNavReserveWidth = showFloatingSearch
    ? FLOATING_SHELL_NAV_WIDTH_PX
    : FLOATING_SHELL_NAV_SINGLE_BUTTON_WIDTH_PX;

  return (
    <div className="flex min-h-0 min-w-0 flex-1 flex-col overflow-hidden">
      <ContentTitleBar
        leading={titleBarLeading}
        trailing={titleBarTrailing}
        reserveFloatingNavSpace={isMobile || !sidebarOpen}
        floatingNavReserveWidth={floatingNavReserveWidth}
      />
      {children}
    </div>
  );
}
