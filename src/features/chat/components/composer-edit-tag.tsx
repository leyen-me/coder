"use client";

import { cn } from "@/lib/utils";
import { PencilIcon, XIcon } from "lucide-react";

type ComposerEditTagProps = {
  label: string;
  dismissLabel: string;
  onDismiss: () => void;
  className?: string;
};

export function ComposerEditTag({
  label,
  dismissLabel,
  onDismiss,
  className,
}: ComposerEditTagProps) {
  return (
    <div
      className={cn(
        "flex items-center justify-between border-b border-border/60 px-4 py-2",
        "animate-in fade-in-0 slide-in-from-top-1 duration-150",
        className
      )}
    >
      <div className="flex items-center gap-2 text-xs font-medium text-primary">
        <PencilIcon className="size-3.5" strokeWidth={2} />
        <span>{label}</span>
      </div>
      <button
        aria-label={dismissLabel}
        className="inline-flex size-5 items-center justify-center rounded-md text-muted-foreground/60 transition-colors hover:bg-muted hover:text-foreground"
        onClick={onDismiss}
        type="button"
      >
        <XIcon className="size-3.5" strokeWidth={2} />
      </button>
    </div>
  );
}
