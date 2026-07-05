import type { ReactNode } from "react";

import { Sheet, SheetContent } from "@/components/ui/sheet";
import { useIsMobile } from "@/hooks/use-mobile";
import { cn } from "@/lib/utils";

import { APP_SIDEBAR_WIDTH_PX } from "./constants";

type ResponsiveSidebarPanelProps = {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  children: ReactNode;
  /** Accessible label for the mobile sheet. */
  ariaLabel?: string;
};

/**
 * Desktop: inline collapsible sidebar panel.
 * Mobile: left sheet overlay so main content stays full width.
 */
export function ResponsiveSidebarPanel({
  open,
  onOpenChange,
  children,
  ariaLabel,
}: ResponsiveSidebarPanelProps) {
  const isMobile = useIsMobile();

  if (isMobile) {
    return (
      <Sheet open={open} onOpenChange={onOpenChange}>
        <SheetContent
          side="left"
          showCloseButton={false}
          aria-label={ariaLabel}
          className={cn(
            "w-[min(100vw,theme(spacing.80))] max-w-none gap-0 border-r border-sidebar-border bg-sidebar p-0 text-sidebar-foreground sm:max-w-none",
          )}
          style={{ width: APP_SIDEBAR_WIDTH_PX }}
        >
          <div className="flex h-full flex-col">{children}</div>
        </SheetContent>
      </Sheet>
    );
  }

  return (
    <div
      style={{ width: open ? APP_SIDEBAR_WIDTH_PX : 0 }}
      className={cn(
        "flex h-full shrink-0 overflow-hidden border-r border-sidebar-border bg-sidebar transition-[width,border-color] duration-300 ease-in-out",
        !open && "border-transparent",
      )}
      aria-hidden={!open}
    >
      <aside
        style={{ width: APP_SIDEBAR_WIDTH_PX }}
        className={cn(
          "flex h-full flex-col text-sidebar-foreground transition-opacity duration-300 ease-in-out",
          open ? "opacity-100" : "pointer-events-none opacity-0",
        )}
      >
        {children}
      </aside>
    </div>
  );
}
