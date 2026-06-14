"use client";

import type { ReactNode } from "react";

type PanelHeaderProps = {
  icon: ReactNode;
  title: string;
  /** Optional badge rendered next to the title (e.g. "Saved" indicator). */
  badge?: ReactNode;
  actions?: ReactNode;
};

/**
 * Unified header bar for every right-panel module.
 *
 * Layout:
 *   [icon] Title [badge]            [action buttons...]
 */
export function PanelHeader({ icon, title, badge, actions }: PanelHeaderProps) {
  return (
    <div className="flex h-9 shrink-0 items-center justify-between gap-2 border-b px-3">
      <div className="flex min-w-0 items-center gap-2">
        <span className="flex size-4 shrink-0 items-center justify-center text-muted-foreground">
          {icon}
        </span>
        <span className="truncate text-sm font-medium">{title}</span>
        {badge}
      </div>
      {actions ? (
        <div className="flex shrink-0 items-center gap-0.5">{actions}</div>
      ) : null}
    </div>
  );
}
