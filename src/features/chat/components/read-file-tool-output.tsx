"use client";

import { useMemo } from "react";

import { CodeBlock } from "@/components/ai-elements/code-block";
import { formatReadFileOutputForDisplay } from "@/features/agent/tools/read-file-display";
import { cn } from "@/lib/utils";
import {
  CheckCircle2Icon,
  CircleIcon,
  ExternalLinkIcon,
  LoaderCircleIcon,
  XCircleIcon,
} from "lucide-react";

import { OPEN_FILE_IN_PREVIEW_EVENT } from "@/features/right-panel/lib/open-file-event";
import type { ToolUIPart } from "ai";

type ReadFileToolOutputProps = {
  output: unknown;
  input: unknown;
  toolName: string;
  state: ToolUIPart["state"];
  errorText?: string;
  className?: string;
};

export function ReadFileToolOutput({
  output,
  input,
  toolName,
  state,
  errorText,
  className,
}: ReadFileToolOutputProps) {
  const formatted = formatReadFileOutputForDisplay(output);

  const filePath = formatted?.path ?? resolveFilePathFromInput(input);
  const content = formatted?.content ?? "";
  const totalLines = formatted?.totalLines ?? 0;
  const startLine = formatted?.startLine ?? 1;
  const endLine = formatted?.endLine ?? 0;
  const truncated = formatted?.truncated ?? false;
  const containsSecrets = formatted?.containsSecrets ?? false;
  const isError = state === "output-error" && errorText;

  // Infer code language from file extension
  const language = useMemo(() => inferLanguage(filePath), [filePath]);

  return (
    <div className={cn("w-full overflow-hidden rounded-md border", className)}>
      {/* Header bar */}
      <div className="flex flex-wrap items-center gap-x-2 gap-y-1 border-b bg-muted/30 px-3 py-1.5 text-xs">
        <ToolStatusIcon state={state} />
        <span className="font-mono font-medium text-foreground">
          {toolName}
        </span>
        <span className="text-muted-foreground">·</span>
        <span className="font-mono text-muted-foreground">{filePath}</span>
        <span className="font-mono text-muted-foreground/60">
          L{startLine}-{endLine}
        </span>
        {totalLines > 0 ? (
          <span className="font-mono text-muted-foreground/50">
            / {totalLines} lines
          </span>
        ) : null}
        {containsSecrets ? (
          <span className="rounded-full bg-amber-500/10 px-1.5 py-0.5 font-mono text-[10px] font-medium text-amber-600">
            secrets
          </span>
        ) : null}
        {truncated ? (
          <span className="rounded-full bg-amber-500/10 px-1.5 py-0.5 font-mono text-[10px] font-medium text-amber-600">
            truncated
          </span>
        ) : null}
        <div className="ml-auto">
          <button
            aria-label="Open in preview"
            className="flex size-4 items-center justify-center text-muted-foreground/50 transition-colors hover:text-muted-foreground"
            onClick={() => {
              const name = filePath.split("/").pop() ?? filePath;
              window.dispatchEvent(
                new CustomEvent(OPEN_FILE_IN_PREVIEW_EVENT, {
                  detail: { path: filePath, name },
                }),
              );
            }}
            title="Open file in preview"
            type="button"
          >
            <ExternalLinkIcon className="size-3" />
          </button>
        </div>
      </div>

      {/* Error banner */}
      {isError ? (
        <div className="flex items-start gap-2 bg-destructive/10 px-3 py-2.5 text-xs text-destructive">
          <span className="min-w-0 flex-1 whitespace-pre-wrap break-words">
            {errorText}
          </span>
        </div>
      ) : (
        /* Code content */
        <div className="max-h-96 overflow-y-auto">
          {content ? (
            <CodeBlock
              code={content}
              language={language as unknown as import("shiki").BundledLanguage}
              showLineNumbers
            />
          ) : (
            <div className="px-3 py-4 font-mono text-xs text-muted-foreground">
              (empty file)
            </div>
          )}
        </div>
      )}
    </div>
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

function ToolStatusIcon({ state }: { state: ToolUIPart["state"] }) {
  switch (state) {
    case "output-available":
      return (
        <CheckCircle2Icon className="size-3.5 shrink-0 text-green-600" />
      );
    case "output-error":
      return <XCircleIcon className="size-3.5 shrink-0 text-destructive" />;
    case "input-streaming":
    case "input-available":
      return (
        <LoaderCircleIcon className="size-3.5 shrink-0 animate-spin text-muted-foreground" />
      );
    default:
      return <CircleIcon className="size-3.5 shrink-0 text-muted-foreground" />;
  }
}
