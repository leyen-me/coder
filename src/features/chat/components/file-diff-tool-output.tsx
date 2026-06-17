"use client";

import ReactDiffViewer from "react-diff-viewer";

import { useMemo } from "react";

import { extractFileDiffData } from "@/features/agent/tools/file-diff-display";
import {
  EDIT_FILE_TOOL_NAME,
  REPLACE_FILE_TOOL_NAME,
  WRITE_FILE_TOOL_NAME,
} from "@/features/agent/tools/definitions";

import { useTheme } from "@/lib/theme/theme-provider";
import { cn } from "@/lib/utils";

import { Badge } from "@/components/ui/badge";

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
  replaceAll: boolean,
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
  input: unknown,
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

type ShowMode = "diff" | "single" | "none";

/**
 * Reads a CSS custom property value from :root / .dark.
 * Returns the raw computed value (e.g. "oklch(0.145 0 0)").
 */
function readCssVar(name: string): string {
  if (typeof document === "undefined") return "";
  return getComputedStyle(document.documentElement).getPropertyValue(name).trim();
}

/**
 * Builds the theme-aware `styles.variables` object for ReactDiffViewer.
 * Uses CSS color-mix to blend theme tokens so diff colors always match the app theme.
 */
function buildDiffStyles(isDark: boolean): Record<string, unknown> {
  // Read the shadcn CSS variables for the active theme.
  const bg = readCssVar("--background") || (isDark ? "oklch(0.145 0 0)" : "oklch(1 0 0)");
  const fg = readCssVar("--foreground") || (isDark ? "oklch(0.985 0 0)" : "oklch(0.145 0 0)");
  const muted = readCssVar("--muted") || (isDark ? "oklch(0.269 0 0)" : "oklch(0.97 0 0)");
  const mutedFg = readCssVar("--muted-foreground") || (isDark ? "oklch(0.708 0 0)" : "oklch(0.556 0 0)");
  const border = readCssVar("--border") || (isDark ? "oklch(1 0 0 / 10%)" : "oklch(0.922 0 0)");

  // Use clearly distinguishable green/red with alpha transparency.
  // These match Tailwind green-500 and red-500 for reliable diff coloring.
  const addedBg = "rgba(34, 197, 94, 0.15)";
  const removedBg = "rgba(239, 68, 68, 0.15)";
  const wordAddedBg = "rgba(34, 197, 94, 0.4)";
  const wordRemovedBg = "rgba(239, 68, 68, 0.4)";
  const addedGutterBg = "rgba(34, 197, 94, 0.25)";
  const removedGutterBg = "rgba(239, 68, 68, 0.25)";
  const gutterBgDark = `color-mix(in oklch, ${muted} 100%, #000 5%)`;

  return {
    variables: {
      light: {
        diffViewerBackground: bg,
        diffViewerColor: fg,
        addedBackground: addedBg,
        addedColor: fg,
        removedBackground: removedBg,
        removedColor: fg,
        wordAddedBackground: wordAddedBg,
        wordRemovedBackground: wordRemovedBg,
        addedGutterBackground: addedGutterBg,
        removedGutterBackground: removedGutterBg,
        gutterBackground: muted,
        gutterBackgroundDark: gutterBgDark,
        highlightBackground: "color-mix(in oklch, var(--warning) 20%, var(--background))",
        highlightGutterBackground: "color-mix(in oklch, var(--warning) 30%, var(--background))",
        codeFoldGutterBackground: muted,
        codeFoldBackground: muted,
        emptyLineBackground: bg,
        gutterColor: mutedFg,
        addedGutterColor: fg,
        removedGutterColor: fg,
        codeFoldContentColor: mutedFg,
        diffViewerTitleBackground: muted,
        diffViewerTitleColor: fg,
        diffViewerTitleBorderColor: border,
      },
      dark: {
        diffViewerBackground: bg,
        diffViewerColor: fg,
        addedBackground: addedBg,
        addedColor: fg,
        removedBackground: removedBg,
        removedColor: fg,
        wordAddedBackground: wordAddedBg,
        wordRemovedBackground: wordRemovedBg,
        addedGutterBackground: addedGutterBg,
        removedGutterBackground: removedGutterBg,
        gutterBackground: muted,
        gutterBackgroundDark: gutterBgDark,
        highlightBackground: "color-mix(in oklch, var(--warning) 20%, var(--background))",
        highlightGutterBackground: "color-mix(in oklch, var(--warning) 30%, var(--background))",
        codeFoldGutterBackground: muted,
        codeFoldBackground: muted,
        emptyLineBackground: bg,
        gutterColor: mutedFg,
        addedGutterColor: fg,
        removedGutterColor: fg,
        codeFoldContentColor: mutedFg,
        diffViewerTitleBackground: muted,
        diffViewerTitleColor: fg,
        diffViewerTitleBorderColor: border,
      },
    },
    // Subtle rounded corners on the diff container and gutters.
    diffContainer: {
      borderRadius: "calc(var(--radius) * 0.6)",
    },
    // Monospace font matching the app's code style.
    contentText: {
      fontFamily:
        "ui-monospace, SFMono-Regular, Menlo, Monaco, Consolas, monospace",
      fontSize: "12px",
      lineHeight: "1.5",
    },

  };
}

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
    [derivedToolName, data?.oldContent, input],
  );

  const filePath = resolveFilePath(output, input);
  const isDark = resolved === "dark";

  const diffStyles = useMemo(() => buildDiffStyles(isDark), [isDark]);

  // Decide what to show:
  // - "diff":  old content exists AND differs → inline unified diff
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
          <span className="font-mono text-xs text-success">
            +{linesAdded}
          </span>
        ) : null}
        {linesRemoved > 0 ? (
          <span className="font-mono text-xs text-destructive">
            -{linesRemoved}
          </span>
        ) : null}
        {warning ? (
          <span className="font-mono text-xs text-warning">
            {warning}
          </span>
        ) : null}
      </div>

      {/* Content area */}
      <div className="overflow-hidden rounded-md border">
        <ReactDiffViewer
          oldValue={showMode === "single" ? "" : original}
          newValue={modified}
          splitView={false}
          useDarkTheme={isDark}
          disableWordDiff={true}
          showDiffOnly={true}
          extraLinesSurroundingDiff={3}
          styles={diffStyles}
        />
      </div>
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
