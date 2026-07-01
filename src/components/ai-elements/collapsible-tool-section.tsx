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
  /** Header content — always visible, clickable to toggle when collapsible */
  header: ReactNode;
  /** Body content — hidden when collapsed */
  children: ReactNode;
  /** Error text — always visible even when collapsed */
  errorText?: string;
  /** Whether the body starts open (default: true) */
  defaultOpen?: boolean;
  /** Whether the section is collapsible (default: true). When false, content is always visible and header is not clickable. */
  collapsible?: boolean;
  className?: string;
};

/**
 * Shared wrapper for tool output components that adds collapse/expand behavior.
 * The header becomes a clickable trigger; the body content is collapsed by
 * default to reduce initial DOM volume and improve rendering performance.
 * Error banners are always visible regardless of collapse state.
 *
 * When `collapsible={false}`, the header is rendered as a static label and
 * content is always visible — useful when the parent already controls visibility.
 */
export function CollapsibleToolSection({
  header,
  children,
  errorText,
  defaultOpen = true,
  collapsible = true,
  className,
}: CollapsibleToolSectionProps) {
  if (!collapsible) {
    return (
      <div className={cn("group w-full overflow-hidden rounded-md border", className)}>
        <div className="flex items-center gap-2 overflow-hidden border-b bg-muted/30 px-3 py-1.5 text-xs">
          {header}
        </div>

        {errorText ? (
          <div className="bg-destructive/10 px-3 py-2.5 text-xs text-destructive">
            {errorText}
          </div>
        ) : null}

        {children}
      </div>
    );
  }

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
