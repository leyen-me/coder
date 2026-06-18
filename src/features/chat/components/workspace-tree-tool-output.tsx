"use client";

import { CodeBlock } from "@/components/ai-elements/code-block";
import { extractWorkspaceTreeData } from "@/features/agent/tools/workspace-tree-display";
import { cn } from "@/lib/utils";

type WorkspaceTreeToolOutputProps = {
  output: unknown;
  className?: string;
};

export function WorkspaceTreeToolOutput({
  output,
  className,
}: WorkspaceTreeToolOutputProps) {
  const data = extractWorkspaceTreeData(output);
  if (!data) {
    return null;
  }

  const lines = data.endLine - data.startLine + 1;

  return (
    <div className={cn("space-y-2", className)}>
      {/* Info bar */}
      <div className="flex flex-wrap items-center gap-x-2 gap-y-1 text-xs text-muted-foreground">
        <span className="font-mono">
          L{data.startLine}-{data.endLine}
        </span>
        <span>/</span>
        <span className="font-mono">{lines} lines</span>
        {data.truncated ? (
          <>
            <span>/</span>
            <span className="font-mono text-warning">truncated</span>
          </>
        ) : null}
      </div>
      {/* Tree content */}
      <CodeBlock code={data.treeText} language="bash" showLineNumbers />
    </div>
  );
}
