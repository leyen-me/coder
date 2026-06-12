"use client";

import { GitBranchIcon } from "lucide-react";

type EmptyStateProps = {
  icon?: React.ReactNode;
  message: string;
};

export function EmptyState({ icon, message }: EmptyStateProps) {
  return (
    <div className="flex h-full flex-col items-center justify-center gap-2 px-6 text-center">
      {icon ?? <GitBranchIcon className="size-8 text-muted-foreground/40" />}
      <p className="text-sm text-muted-foreground">{message}</p>
    </div>
  );
}
