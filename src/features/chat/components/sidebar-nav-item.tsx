import type { LucideIcon } from "lucide-react";

import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";

type SidebarNavItemProps = {
  icon: LucideIcon;
  label: string;
  isActive?: boolean;
  onClick?: () => void;
};

export function SidebarNavItem({
  icon: Icon,
  label,
  isActive = false,
  onClick,
}: SidebarNavItemProps) {
  return (
    <Button
      type="button"
      variant="ghost"
      onClick={onClick}
      className={cn(
        "h-9 w-full justify-start gap-2.5 rounded-xl px-2 font-normal text-sidebar-foreground hover:bg-sidebar-accent hover:text-sidebar-accent-foreground",
        isActive && "bg-sidebar-accent text-sidebar-accent-foreground"
      )}
    >
      <Icon className="size-4 shrink-0 opacity-70" />
      <span className="truncate">{label}</span>
    </Button>
  );
}
