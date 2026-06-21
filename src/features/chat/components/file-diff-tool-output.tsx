"use client";

import type { ToolUIPart } from "ai";
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

import {
  CheckCircle2Icon,
  CircleIcon,
  ExternalLinkIcon,
  LoaderCircleIcon,
  XCircleIcon,
} from "lucide-react";

import { OPEN_FILE_IN_PREVIEW_EVENT } from "@/features/right-panel/lib/open-file-event";

type FileDiffToolOutputProps = {
  output: unknown;
  input: unknown;
  toolName: string;
  state: ToolUIPart["state"];
  errorText?: string;
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
 * Builds the theme-aware `styles.variables` object for ReactDiffViewer.
 * Uses CSS color-mix to blend theme tokens so diff colors always match the app theme.
 */
function buildDiffStyles(isDark: boolean): Record<string, unknown> {
  // Hardcoded shadcn theme colors — using isDark directly avoids DOM read
  // timing issues when React hasn't committed the theme class yet.
  const theme = isDark
    ? {
        bg: "oklch(0.145 0 0)",
        fg: "oklch(0.985 0 0)",
        muted: "oklch(0.269 0 0)",
        mutedFg: "oklch(0.708 0 0)",
        border: "oklch(1 0 0 / 10%)",
      }
    : {
        bg: "oklch(1 0 0)",
        fg: "oklch(0.145 0 0)",
        muted: "oklch(0.97 0 0)",
        mutedFg: "oklch(0.556 0 0)",
        border: "oklch(0.922 0 0)",
      };

  const { bg, fg, muted, mutedFg, border } = theme;

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
    // Smaller line numbers.
    lineNumber: {
      fontSize: "11px",
    },
    // Hide code-fold rows entirely — no expand button, no layout gap.
    codeFold: {
      display: "none",
    },
    codeFoldGutter: {
      display: "none",
    },

  };
}

export function FileDiffToolOutput({
  output,
  input,
  toolName,
  state,
  errorText,
  className,
}: FileDiffToolOutputProps) {
  const { resolved } = useTheme();

  const data = extractFileDiffData(output);

  const original = data?.oldContent ?? "";
  const hasOldContent = data?.oldContent !== undefined;

  const modified = useMemo(
    () => resolveModifiedContent(toolName, data?.oldContent, input),
    [toolName, data?.oldContent, input],
  );

  const filePath = resolveFilePath(output, input);
  const isDark = resolved === "dark";

  const diffStyles = useMemo(() => buildDiffStyles(isDark), [isDark]);
  const isError = state === "output-error" && errorText;

  // Decide what to show:
  // - "diff":  old content exists AND differs → inline unified diff
  // - "single": no old content (new file) → just the modified content
  // - "none":  nothing changed and no warning → hidden
  // - On error: still render the container with the error message
  const showMode: ShowMode = isError
    ? "none"
    : !hasOldContent
      ? "single"
      : original !== modified
        ? "diff"
        : "none";

  const linesAdded = data?.linesAdded ?? 0;
  const linesRemoved = data?.linesRemoved ?? 0;
  const action = data?.action ?? "";
  const warning = data?.warning;

  // Don't hide the component when there's an error to display
  if (showMode === "none" && !warning && !isError) {
    return null;
  }

  return (
    <div className={cn("w-full overflow-hidden rounded-md border", className)}>
      {/* Header bar — merges status + tool + path + stats */}
      <div className="flex flex-wrap items-center gap-x-2 gap-y-1 border-b bg-muted/30 px-3 py-1.5 text-xs">
        <ToolStatusIcon state={state} />
        <span className="font-mono font-medium text-foreground">
          {toolName}
        </span>
        <span className="text-muted-foreground">·</span>
        <span className="font-mono text-muted-foreground">{filePath}</span>
        {action ? (
          <span
            className={cn(
              "rounded-full px-1.5 py-0.5 font-mono text-[10px] font-medium",
              action === "created"
                ? "bg-primary/10 text-primary"
                : "bg-muted-foreground/10 text-muted-foreground",
            )}
          >
            {action}
          </span>
        ) : null}
        {linesAdded > 0 ? (
          <span className="font-mono font-medium text-success">+{linesAdded}</span>
        ) : null}
        {linesRemoved > 0 ? (
          <span className="font-mono font-medium text-destructive">
            -{linesRemoved}
          </span>
        ) : null}
        {warning ? (
          <span className="font-mono text-warning">{warning}</span>
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

      {/* Content area: show error message or diff */}
      {isError ? (
        <div className="flex items-start gap-2 bg-destructive/10 px-3 py-2.5 text-xs text-destructive">
          <span className="min-w-0 flex-1 whitespace-pre-wrap break-words">
            {errorText}
          </span>
        </div>
      ) : (
        <div
          className={cn(
            showMode === "single" &&
              "max-h-80 overflow-y-auto [&::-webkit-scrollbar]:w-1.5 [&::-webkit-scrollbar-thumb]:rounded-full [&::-webkit-scrollbar-thumb]:bg-border [&::-webkit-scrollbar-track]:bg-transparent",
          )}
        >
          <ReactDiffViewer
            oldValue={showMode === "single" ? "" : original}
            newValue={modified}
            splitView={false}
            useDarkTheme={isDark}
            disableWordDiff={true}
            showDiffOnly={true}
            extraLinesSurroundingDiff={3}
            codeFoldMessageRenderer={() => null}
            styles={diffStyles}
          />
        </div>
      )}
    </div>
  );
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

function asRecord(value: unknown): Record<string, unknown> | null {
  if (typeof value === "object" && value !== null && !Array.isArray(value)) {
    return value as Record<string, unknown>;
  }
  return null;
}
