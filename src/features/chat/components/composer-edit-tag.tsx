"use client";

import { cn } from "@/lib/utils";
import { XIcon } from "lucide-react";

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
    <span
      className={cn(
        "inline-flex w-fit max-w-full shrink-0 self-start items-center gap-0.5 rounded-md border border-primary/20 bg-primary/10 py-0.5 pr-0.5 pl-2 text-primary",
        "animate-in fade-in-0 zoom-in-95 duration-150",
        className
      )}
    >
      <span className="truncate text-xs font-medium">{label}</span>
      <button
        aria-label={dismissLabel}
        className="inline-flex size-4 shrink-0 items-center justify-center rounded-sm text-primary/80 transition-colors hover:bg-primary/15 hover:text-primary"
        onClick={onDismiss}
        type="button"
      >
        <XIcon className="size-3" strokeWidth={2.5} />
      </button>
    </span>
  );
}
