"use client";

import type { ToolUIPart } from "ai";

import { CodeBlock } from "@/components/ai-elements/code-block";
import {
  CollapsibleToolSection,
} from "@/components/ai-elements/collapsible-tool-section";
import { extractWorkspaceTreeData } from "@/features/agent/tools/workspace-tree-display";
import { ToolStatusIcon } from "./tool-status-icon";

type WorkspaceTreeToolOutputProps = {
  output: unknown;
  toolName: string;
  state: ToolUIPart["state"];
  errorText?: string;
  className?: string;
};

export function WorkspaceTreeToolOutput({
  output,
  toolName,
  state,
  errorText,
  className,
}: WorkspaceTreeToolOutputProps) {
  const data = extractWorkspaceTreeData(output);
  const isError = state === "output-error" && errorText;

  return (
    <CollapsibleToolSection
      className={className}
      errorText={isError ? errorText : undefined}
      header={
        <>
          <ToolStatusIcon state={state} />
          <span className="font-mono font-medium text-foreground">
            {toolName}
          </span>
          {data ? (
            <>
              <span className="text-muted-foreground">·</span>
              <span className="font-mono text-muted-foreground">
                L{data.startLine}-{data.endLine}
              </span>
              {data.truncated ? (
                <span className="rounded-full bg-amber-500/10 px-1.5 py-0.5 font-mono text-[10px] font-medium text-amber-600">
                  truncated
                </span>
              ) : null}
            </>
          ) : null}
        </>
      }
    >
      {data ? (
        <div className="max-h-96 overflow-y-auto">
          <CodeBlock
            code={data.treeText || "(empty)"}
            language="bash"
            showLineNumbers
          />
        </div>
      ) : null}
    </CollapsibleToolSection>
  );
}


