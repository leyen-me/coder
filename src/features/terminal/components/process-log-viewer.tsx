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

  const content = [stdout, stderr ? `\n[stderr]\n${stderr}` : ""]
    .join("")
    .trim();

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
