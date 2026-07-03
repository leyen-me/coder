"use client";

import { cn } from "@/lib/utils";

import "../interactive-terminal.css";

type InteractiveTerminalProps = {
  cwd: string;
  className?: string;
  isActive?: boolean;
};

export function InteractiveTerminal({
  _cwd,
  className,
  _isActive = true,
}: InteractiveTerminalProps) {
  return (
    <div className={cn("flex h-full items-center justify-center text-sm text-muted-foreground", className)}>
      Terminal is only available in the desktop app.
    </div>
  );
}
