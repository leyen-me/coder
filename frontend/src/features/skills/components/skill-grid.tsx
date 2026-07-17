import type { ReactNode } from "react";

import { cn } from "@/lib/utils";

type SkillGridProps = {
  children: ReactNode;
  className?: string;
};

export function SkillGrid({ children, className }: SkillGridProps) {
  return (
    <div
      className={cn(
        "grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-3",
        className
      )}
    >
      {children}
    </div>
  );
}
