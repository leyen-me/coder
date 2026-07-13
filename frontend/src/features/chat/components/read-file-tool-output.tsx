"use client";

import { useMemo } from "react";
import type { ToolUIPart } from "ai";


import { CodeBlock } from "@/components/ai-elements/code-block";
import {
  CollapsibleToolSection,
} from "@/components/ai-elements/collapsible-tool-section";
import { formatReadFileOutputForDisplay } from "@/features/agent/tools/read-file-display";

import { ToolStatusIcon } from "./tool-status-icon";

type ReadFileToolOutputProps = {
  output: unknown;
  input: unknown;
  toolName: string;
  state: ToolUIPart["state"];
  errorText?: string;
  className?: string;
  collapsible?: boolean;
};

export function ReadFileToolOutput({
  output,
  input,
  toolName,
  state,
  errorText,
  className,
  collapsible,
}: ReadFileToolOutputProps) {
  const formatted = formatReadFileOutputForDisplay(output);

  const filePath = formatted?.path ?? resolveFilePathFromInput(input);
  const content = formatted?.content ?? "";
  // Strip line-number prefixes (e.g. "1 | code", " 42 | code") so
  // Shiki syntax highlighting works on the raw code, not garbled text.
  const cleanContent = useMemo(() => stripLineNumbers(content), [content]);
  const totalLines = formatted?.totalLines ?? 0;
  const startLine = formatted?.startLine ?? 1;
  const endLine = formatted?.endLine ?? 0;
  const truncated = formatted?.truncated ?? false;
  const containsSecrets = formatted?.containsSecrets ?? false;
  const isError = state === "output-error" && errorText;

  // Infer code language from file extension
  const language = useMemo(() => inferLanguage(filePath), [filePath]);

  return (
    <CollapsibleToolSection
      className={className}
      collapsible={collapsible}
      errorText={isError ? errorText : undefined}
      header={
        <>
          <ToolStatusIcon state={state} />
          <span className="font-mono font-medium text-foreground shrink-0">
            {toolName}
          </span>
          <span className="text-muted-foreground shrink-0">·</span>
          <span className="min-w-0 truncate font-mono text-muted-foreground">{filePath}</span>
          <span className="shrink-0 font-mono text-muted-foreground/60">
            L{startLine}-{endLine}
          </span>
          {totalLines > 0 ? (
            <span className="shrink-0 font-mono text-muted-foreground/50">
              / {totalLines} lines
            </span>
          ) : null}
          {containsSecrets ? (
            <span className="shrink-0 rounded-full bg-amber-500/10 px-1.5 py-0.5 font-mono text-[10px] font-medium text-amber-600">
              secrets
            </span>
          ) : null}
          {truncated ? (
            <span className="shrink-0 rounded-full bg-amber-500/10 px-1.5 py-0.5 font-mono text-[10px] font-medium text-amber-600">
              truncated
            </span>
          ) : null}

        </>
      }
    >
      {content ? (
        <div className="max-h-96 overflow-y-auto">
          <CodeBlock
            code={cleanContent}
            language={language as unknown as import("shiki").BundledLanguage}
            showLineNumbers
          />
        </div>
      ) : (
        <div className="px-3 py-4 font-mono text-xs text-muted-foreground">
          (empty file)
        </div>
      )}
    </CollapsibleToolSection>
  );
}

function resolveFilePathFromInput(input: unknown): string {
  if (!input || typeof input !== "object") return "file.txt";
  const record = input as Record<string, unknown>;
  return typeof record.path === "string" ? record.path : "file.txt";
}

function inferLanguage(filePath: string): string {
  const ext = filePath.split(".").pop()?.toLowerCase() ?? "";
  const langMap: Record<string, string> = {
    ts: "typescript",
    tsx: "typescript",
    js: "javascript",
    jsx: "javascript",
    rs: "rust",
    py: "python",
    rb: "ruby",
    go: "go",
    java: "java",
    c: "c",
    cpp: "cpp",
    h: "c",
    hpp: "cpp",
    css: "css",
    scss: "scss",
    less: "less",
    html: "html",
    md: "markdown",
    json: "json",
    yaml: "yaml",
    yml: "yaml",
    toml: "toml",
    xml: "xml",
    sql: "sql",
    sh: "bash",
    bash: "bash",
    zsh: "bash",
    dockerfile: "dockerfile",
    gitignore: "gitignore",
    env: "dotenv",
    lock: "json",
  };
  return langMap[ext] ?? "";
}

/**
 * Remove `"N | "` line-number prefixes added by the backend's
 * `format_numbered_content` so Shiki highlights the raw code correctly.
 */
function stripLineNumbers(content: string): string {
  return content.replace(/^[ \t]*\d+ \| /gm, "");
}
