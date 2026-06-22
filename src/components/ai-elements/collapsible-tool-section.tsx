"use client";

import { ChevronRightIcon } from "lucide-react";
import type { ReactNode } from "react";

import {
  Collapsible,
  CollapsibleContent,
  CollapsibleTrigger,
} from "@/components/ui/collapsible";
import { cn } from "@/lib/utils";

type CollapsibleToolSectionProps = {
  /** Header content — always visible, clickable to toggle */
  header: ReactNode;
  /** Body content — hidden when collapsed */
  children: ReactNode;
  /** Error text — always visible even when collapsed */
  errorText?: string;
  /** Whether the body starts open (default: false) */
  defaultOpen?: boolean;
  className?: string;
};

/**
 * Shared wrapper for tool output components that adds collapse/expand behavior.
 * The header becomes a clickable trigger; the body content is collapsed by
 * default to reduce initial DOM volume and improve rendering performance.
 * Error banners are always visible regardless of collapse state.
 */
export function CollapsibleToolSection({
  header,
  children,
  errorText,
  defaultOpen = true,
  className,
}: CollapsibleToolSectionProps) {
  return (
    <Collapsible
      defaultOpen={defaultOpen}
      className={cn("group w-full overflow-hidden rounded-md border", className)}
    >
      <CollapsibleTrigger asChild>
        <div className="flex cursor-pointer items-center gap-2 overflow-hidden border-b bg-muted/30 px-3 py-1.5 text-xs">
          <ChevronRightIcon className="size-3.5 shrink-0 text-muted-foreground transition-transform group-data-[state=open]:rotate-90" />
          {header}
        </div>
      </CollapsibleTrigger>

      {errorText ? (
        <div className="bg-destructive/10 px-3 py-2.5 text-xs text-destructive">
          {errorText}
        </div>
      ) : null}

      <CollapsibleContent>
        {children}
      </CollapsibleContent>
    </Collapsible>
  );
}
