"use client";

import { useEffect, useRef } from "react";

import { cn } from "@/lib/utils";

type ProcessLogViewerProps = {
  stdout: string;
  stderr: string;
  className?: string;
};

export function ProcessLogViewer({
  stdout,
  stderr,
  className,
}: ProcessLogViewerProps) {
  const containerRef = useRef<HTMLPreElement>(null);

  useEffect(() => {
    const element = containerRef.current;
    if (!element) {
      return;
    }
    element.scrollTop = element.scrollHeight;
  }, [stdout, stderr]);

  const content = mergeProcessLogContent(stdout, stderr);

  return (
    <pre
      ref={containerRef}
      className={cn(
        "h-full overflow-auto rounded-md border bg-muted/30 p-3 font-mono text-xs leading-relaxed",
        className
      )}
    >
      {content || " "}
    </pre>
  );
}

/** Skip stderr when it duplicates stdout (common with piped npm/vite output). */
function mergeProcessLogContent(stdout: string, stderr: string): string {
  const trimmedStdout = stdout.trimEnd();
  const trimmedStderr = stderr.trim();

  if (!trimmedStderr) {
    return trimmedStdout;
  }

  if (trimmedStderr === trimmedStdout.trim()) {
    return trimmedStdout;
  }

  return `${trimmedStdout}${trimmedStdout ? "\n\n" : ""}[stderr]\n${stderr}`.trim();
}
