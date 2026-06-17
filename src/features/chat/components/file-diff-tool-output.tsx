"use client";

import { DiffEditor, Editor, loader } from "@monaco-editor/react";
import * as monaco from "monaco-editor";
import { useMemo } from "react";

import { defineMonacoTheme } from "@/lib/monaco/get-monaco-theme";
import "@/lib/monaco/setup-monaco-environment";
import { useTheme } from "@/lib/theme/theme-provider";
import { cn } from "@/lib/utils";

import { extractFileDiffData } from "@/features/agent/tools/file-diff-display";
import { guessLanguageFromPath } from "@/features/right-panel/lib/guess-language-from-path";
import {
  EDIT_FILE_TOOL_NAME,
  REPLACE_FILE_TOOL_NAME,
  WRITE_FILE_TOOL_NAME,
} from "@/features/agent/tools/definitions";

import { Badge } from "@/components/ui/badge";

loader.config({ monaco });

type FileDiffToolOutputProps = {
  output: unknown;
  input: unknown;
  toolName?: string;
  className?: string;
};

/**
 * Applies a single or global search-and-replace on `text`.
 * Matches the behavior of the Rust `apply_text_replacement` on the backend.
 */
function applyReplacement(
  text: string,
  oldString: string,
  newString: string,
  replaceAll: boolean
): string {
  if (replaceAll) {
    return text.split(oldString).join(newString);
  }
  const index = text.indexOf(oldString);
  if (index === -1) {
    return text;
  }
  return (
    text.slice(0, index) +
    newString +
    text.slice(index + oldString.length)
  );
}

function resolveModifiedContent(
  toolName: string,
  oldContent: string | undefined,
  input: unknown
): string {
  const inputRecord = asRecord(input);
  if (!inputRecord) {
    return oldContent ?? "";
  }

  switch (toolName) {
    case WRITE_FILE_TOOL_NAME:
    case REPLACE_FILE_TOOL_NAME: {
      return typeof inputRecord.content === "string" ? inputRecord.content : "";
    }

    case EDIT_FILE_TOOL_NAME: {
      const oldString =
        typeof inputRecord.old_string === "string"
          ? inputRecord.old_string
          : "";
      const newString =
        typeof inputRecord.new_string === "string"
          ? inputRecord.new_string
          : "";
      const replaceAll = inputRecord.replace_all === true;
      const base = oldContent ?? "";
      if (!oldString) {
        return base;
      }
      return applyReplacement(base, oldString, newString, replaceAll);
    }

    default:
      return oldContent ?? "";
  }
}

function resolveFilePath(output: unknown, input: unknown): string {
  const data = extractFileDiffData(output);
  if (data?.path) {
    return data.path;
  }

  const inputRecord = asRecord(input);
  if (inputRecord && typeof inputRecord.path === "string") {
    return inputRecord.path;
  }

  return "file.txt";
}

/** Shared Monaco editor options for both diff and single-pane views. */
const SHARED_EDITOR_OPTIONS: monaco.editor.IStandaloneEditorConstructionOptions = {
  automaticLayout: true,
  fontFamily:
    "ui-monospace, SFMono-Regular, Menlo, Monaco, Consolas, monospace",
  fontSize: 12,
  lineNumbers: "on",
  minimap: { enabled: false },
  scrollBeyondLastLine: false,
  wordWrap: "off",
  readOnly: true,
  overviewRulerBorder: false,
  overviewRulerLanes: 0,
  padding: { top: 4, bottom: 4 },
};

/** Height formula that scales with line count up to a max. */
function editorHeight(text: string): number {
  return Math.min(text.split("\n").length * 20 + 40, 400);
}

type ShowMode = "diff" | "single" | "none";

export function FileDiffToolOutput({
  output,
  input,
  toolName = "",
  className,
}: FileDiffToolOutputProps) {
  const { resolved } = useTheme();

  const derivedToolName =
    toolName || (extractOutputToolName(output) ?? "");

  const data = extractFileDiffData(output);

  const original = data?.oldContent ?? "";
  const hasOldContent = data?.oldContent !== undefined;

  const modified = useMemo(
    () => resolveModifiedContent(derivedToolName, data?.oldContent, input),
    [derivedToolName, data?.oldContent, input]
  );

  const filePath = resolveFilePath(output, input);
  const language = guessLanguageFromPath(filePath);

  const theme = useMemo(
    () => defineMonacoTheme(monaco, resolved),
    [resolved]
  );

  const handleBeforeMount = (monacoApi: typeof monaco) => {
    defineMonacoTheme(monacoApi, resolved);
  };

  // Decide what to show:
  // - "diff":  old content exists AND differs → side-by-side diff
  // - "single": no old content (new file) → just the modified content
  // - "none":  nothing changed and no warning → hidden
  const showMode: ShowMode = !hasOldContent
    ? "single"
    : original !== modified
      ? "diff"
      : "none";

  const linesAdded = data?.linesAdded ?? 0;
  const linesRemoved = data?.linesRemoved ?? 0;
  const action = data?.action ?? "";
  const warning = data?.warning;

  if (showMode === "none" && !warning) {
    return null;
  }

  return (
    <div className={cn("space-y-2", className)}>
      {/* Summary bar */}
      <div className="flex flex-wrap items-center gap-2">
        {filePath ? (
          <span className="font-mono text-xs font-medium text-foreground">
            {filePath}
          </span>
        ) : null}
        {action ? (
          <Badge
            className="rounded-full text-[10px]"
            variant={action === "created" ? "default" : "secondary"}
          >
            {action}
          </Badge>
        ) : null}
        {linesAdded > 0 ? (
          <span className="font-mono text-xs text-green-600 dark:text-green-400">
            +{linesAdded}
          </span>
        ) : null}
        {linesRemoved > 0 ? (
          <span className="font-mono text-xs text-red-600 dark:text-red-400">
            -{linesRemoved}
          </span>
        ) : null}
        {warning ? (
          <span className="font-mono text-xs text-amber-600 dark:text-amber-400">
            {warning}
          </span>
        ) : null}
      </div>

      {/* Content area */}
      {showMode === "diff" ? (
        <div className="overflow-hidden rounded-md border">
          <DiffEditor
            beforeMount={handleBeforeMount}
            height={editorHeight(modified)}
            language={language}
            modified={modified}
            original={original}
            options={{
              ...SHARED_EDITOR_OPTIONS,
              enableSplitViewResizing: true,
              renderSideBySide: true,
              renderIndicators: false,
            }}
            theme={theme}
          />
        </div>
      ) : null}

      {showMode === "single" ? (
        <div className="overflow-hidden rounded-md border">
          <Editor
            beforeMount={handleBeforeMount}
            height={editorHeight(modified)}
            language={language}
            options={SHARED_EDITOR_OPTIONS}
            theme={theme}
            value={modified}
          />
        </div>
      ) : null}
    </div>
  );
}

function extractOutputToolName(output: unknown): string | null {
  if (typeof output !== "object" || output === null) {
    return null;
  }
  const record = output as Record<string, unknown>;
  if (typeof record.tool === "string") {
    return record.tool;
  }
  return null;
}

function asRecord(value: unknown): Record<string, unknown> | null {
  if (typeof value === "object" && value !== null && !Array.isArray(value)) {
    return value as Record<string, unknown>;
  }
  return null;
}
