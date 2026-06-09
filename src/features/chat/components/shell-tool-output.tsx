"use client";

import { CodeBlock } from "@/components/ai-elements/code-block";
import {
  formatShellOutputForDisplay,
  getShellStatusColor,
} from "@/features/agent/tools/shell-display";
import type { ShellStatus } from "@/features/agent/tools/types";
import { cn } from "@/lib/utils";

type ShellToolOutputProps = {
  output: unknown;
  className?: string;
};

export function ShellToolOutput({ output, className }: ShellToolOutputProps) {
  const formatted = formatShellOutputForDisplay(output);
  if (!formatted) {
    return null;
  }

  const status = extractStatus(output);

  return (
    <div className={cn("space-y-2", className)}>
      {status ? (
        <p className={cn("font-mono text-xs", getShellStatusColor(status))}>
          {status}
        </p>
      ) : null}
      <CodeBlock code={formatted} language="bash" />
    </div>
  );
}

function extractStatus(output: unknown): ShellStatus | null {
  if (!output || typeof output !== "object") {
    return null;
  }

  const envelope = output as Record<string, unknown>;
  if (envelope.ok !== true) {
    return null;
  }

  const data = envelope.data;
  if (!data || typeof data !== "object") {
    return null;
  }

  const status = (data as Record<string, unknown>).status;
  return typeof status === "string" ? (status as ShellStatus) : null;
}
