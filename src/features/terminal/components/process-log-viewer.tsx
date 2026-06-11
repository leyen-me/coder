"use client";

import { useEffect, useRef } from "react";

import { stripAnsi } from "@/lib/strip-ansi";
import { cn } from "@/lib/utils";

type ProcessLogViewerProps = {
  stdout: string;
  stderr: string;
  className?: string;
};

const STICK_TO_BOTTOM_THRESHOLD_PX = 48;

export function ProcessLogViewer({
  stdout,
  stderr,
  className,
}: ProcessLogViewerProps) {
  const containerRef = useRef<HTMLDivElement>(null);
  const stickToBottomRef = useRef(true);
  const content = stripAnsi(mergeProcessLogContent(stdout, stderr));

  useEffect(() => {
    const container = containerRef.current;
    if (!container || !stickToBottomRef.current) {
      return;
    }

    container.scrollTop = container.scrollHeight;
  }, [content]);

  const handleScroll = () => {
    const container = containerRef.current;
    if (!container) {
      return;
    }

    const distanceFromBottom =
      container.scrollHeight - container.scrollTop - container.clientHeight;
    stickToBottomRef.current =
      distanceFromBottom <= STICK_TO_BOTTOM_THRESHOLD_PX;
  };

  return (
    <div
      ref={containerRef}
      className={cn(
        "h-full min-h-0 overflow-auto rounded-md border bg-background",
        className
      )}
      onScroll={handleScroll}
    >
      <pre className="p-3 font-mono text-xs leading-relaxed whitespace-pre-wrap wrap-break-word text-foreground/90">
        {content || " "}
      </pre>
    </div>
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
