import type { LucideIcon } from "lucide-react";
import { NavLink } from "react-router-dom";

import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";

const itemClassName =
  "inline-flex h-9 w-full items-center justify-start gap-2.5 rounded-xl px-2 text-sm font-normal text-sidebar-foreground transition-colors hover:bg-sidebar-accent hover:text-sidebar-accent-foreground";

type SidebarNavItemProps = {
  icon: LucideIcon;
  label: string;
  to?: string;
  end?: boolean;
  isActive?: boolean;
  onClick?: () => void;
};

export function SidebarNavItem({
  icon: Icon,
  label,
  to,
  end = false,
  isActive: isActiveOverride,
  onClick,
}: SidebarNavItemProps) {
  const content = (
    <>
      <Icon className="size-4 shrink-0 opacity-70" />
      <span className="truncate">{label}</span>
    </>
  );

  if (to) {
    return (
      <NavLink
        to={to}
        end={end}
        className={({ isActive }) =>
          cn(
            itemClassName,
            (isActiveOverride ?? isActive) &&
              "bg-sidebar-accent text-sidebar-accent-foreground"
          )
        }
      >
        {content}
      </NavLink>
    );
  }

  return (
    <Button
      type="button"
      variant="ghost"
      onClick={onClick}
      className={cn(
        itemClassName,
        isActiveOverride &&
          "bg-sidebar-accent text-sidebar-accent-foreground"
      )}
    >
      {content}
    </Button>
  );
}
