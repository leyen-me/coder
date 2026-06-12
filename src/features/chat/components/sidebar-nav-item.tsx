import type { LucideIcon } from "lucide-react";
import { NavLink } from "react-router-dom";

import { Button } from "@/components/ui/button";
import { ShortcutKeys } from "@/features/keyboard-shortcuts/shortcut-keys";
import { useKeyboardShortcuts } from "@/lib/keyboard-shortcuts/keyboard-shortcuts-provider";
import type { ShortcutActionId } from "@/lib/keyboard-shortcuts/types";
import { cn } from "@/lib/utils";

const itemClassName =
  "group relative inline-flex h-9 w-full items-center justify-start gap-2.5 rounded-xl px-2 text-sm font-normal text-sidebar-foreground transition-colors hover:bg-sidebar-accent hover:text-sidebar-accent-foreground";

type SidebarNavItemProps = {
  icon: LucideIcon;
  label: string;
  to?: string;
  end?: boolean;
  isActive?: boolean;
  onClick?: () => void;
  shortcutActionId?: ShortcutActionId;
  "aria-label"?: string;
};

function SidebarShortcutHint({ binding }: { binding: string }) {
  if (!binding) {
    return null;
  }

  return (
    <ShortcutKeys
      binding={binding}
      className={cn(
        "pointer-events-none absolute top-1/2 right-2 -translate-y-1/2 shrink-0 opacity-0 transition-opacity",
        "group-hover:opacity-100 group-focus-visible:opacity-100"
      )}
    />
  );
}

export function SidebarNavItem({
  icon: Icon,
  label,
  to,
  end = false,
  isActive: isActiveOverride,
  onClick,
  shortcutActionId,
  "aria-label": ariaLabel,
}: SidebarNavItemProps) {
  const { getBinding } = useKeyboardShortcuts();
  const shortcutBinding = shortcutActionId
    ? getBinding(shortcutActionId)
    : "";

  const content = (
    <>
      <Icon className="size-4 shrink-0 opacity-70" />
      <span
        className={cn("min-w-0 truncate", shortcutBinding && "pr-16")}
      >
        {label}
      </span>
      <SidebarShortcutHint binding={shortcutBinding} />
    </>
  );

  if (to) {
    return (
      <NavLink
        to={to}
        end={end}
        aria-label={ariaLabel}
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
      aria-label={ariaLabel}
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
