"use client";

import { ToolInput, ToolOutput } from "@/components/ai-elements/tool";
import {
  Sheet,
  SheetContent,
  SheetHeader,
  SheetTitle,
} from "@/components/ui/sheet";
import {
  AWAIT_TOOL_NAME,
  BROWSE_PAGE_TOOL_NAME,
  EDIT_FILE_TOOL_NAME,
  GET_WORKSPACE_TREE_TOOL_NAME,
  GLOB_TOOL_NAME,
  GREP_TOOL_NAME,
  LIST_DIR_TOOL_NAME,
  PLAN_CREATE_TOOL_NAME,
  PLAN_DELETE_TOOL_NAME,
  PLAN_EDIT_TOOL_NAME,
  PLAN_LIST_TOOL_NAME,
  PLAN_READ_TOOL_NAME,
  PLAN_UPDATE_TOOL_NAME,
  READ_FILE_TOOL_NAME,
  REPLACE_FILE_TOOL_NAME,
  SHELL_TOOL_NAME,
  TODO_READ_TOOL_NAME,
  TODO_WRITE_TOOL_NAME,
  WEB_SEARCH_TOOL_NAME,
  WRITE_FILE_TOOL_NAME,
} from "@/features/agent/tools/definitions";
import { getBrowsePageChipLabel } from "@/features/agent/tools/browse-page-display";
import { getFileDiffChipLabel } from "@/features/agent/tools/file-diff-display";
import { getGlobChipLabel } from "@/features/agent/tools/glob-display";
import { getGrepChipLabel } from "@/features/agent/tools/grep-display";
import { getListDirChipLabel } from "@/features/agent/tools/list-dir-display";
import { getPlanChipLabel } from "@/features/agent/tools/plan-display";
import {
  getReadFileChipLabel,
} from "@/features/agent/tools/read-file-display";
import { getShellChipLabel } from "@/features/agent/tools/shell-display";
import { getTodoChipLabel } from "@/features/agent/tools/todo-display";
import { getWebSearchChipLabel } from "@/features/agent/tools/web-search-display";
import { getWorkspaceTreeChipLabel } from "@/features/agent/tools/workspace-tree-display";
import type { MessageToolInvocation } from "@/lib/db";
import { useTranslation } from "@/lib/i18n/locale-provider";
import { cn } from "@/lib/utils";
import type { ToolUIPart } from "ai";
import {
  CheckCircle2Icon,
  CircleIcon,
  LoaderCircleIcon,
  XCircleIcon,
} from "lucide-react";
import { useState } from "react";

import { BrowsePageToolOutput } from "./browse-page-tool-output";
import { FileDiffToolOutput } from "./file-diff-tool-output";
import { GlobToolOutput } from "./glob-tool-output";
import { GrepToolOutput } from "./grep-tool-output";
import { ListDirToolOutput } from "./list-dir-tool-output";
import { PlanToolOutput } from "./plan-tool-output";
import { ReadFileToolOutput } from "./read-file-tool-output";
import { ShellOutput } from "./shell-output";
import { TodoToolOutput } from "./todo-tool-output";
import { WebSearchToolOutput } from "./web-search-tool-output";
import { WorkspaceTreeToolOutput } from "./workspace-tree-tool-output";

type ToolInvocationChipProps = {
  invocation: MessageToolInvocation;
  className?: string;
};

export function ToolInvocationChip({
  invocation,
  className,
}: ToolInvocationChipProps) {
  const { t } = useTranslation();
  const [open, setOpen] = useState(false);
  const chipLabel =
    getShellChipLabel(invocation.name, invocation.input, invocation.output) ??
    getBrowsePageChipLabel(
      invocation.name,
      invocation.input,
      invocation.output,
    ) ??
    getFileDiffChipLabel(
      invocation.name,
      invocation.input,
      invocation.output,
    ) ??
    getReadFileChipLabel(invocation.name, invocation.output) ??
    getGrepChipLabel(invocation.name, invocation.input, invocation.output) ??
    getWebSearchChipLabel(invocation.name, invocation.input, invocation.output) ??
    getGlobChipLabel(invocation.name, invocation.input, invocation.output) ??
    getListDirChipLabel(invocation.name, invocation.input, invocation.output) ??
    getTodoChipLabel(invocation.name, invocation.output) ??
    getPlanChipLabel(invocation.name, invocation.input, invocation.output) ??
    getWorkspaceTreeChipLabel(invocation.name, invocation.output) ??
    invocation.name;
  const isShellTool =
    invocation.name === SHELL_TOOL_NAME || invocation.name === AWAIT_TOOL_NAME;
  const isBrowsePageTool = invocation.name === BROWSE_PAGE_TOOL_NAME;
  const isFileDiffTool =
    invocation.name === WRITE_FILE_TOOL_NAME ||
    invocation.name === REPLACE_FILE_TOOL_NAME ||
    invocation.name === EDIT_FILE_TOOL_NAME;
  const isReadFileTool = invocation.name === READ_FILE_TOOL_NAME;
  const isGrepTool = invocation.name === GREP_TOOL_NAME;
  const isWebSearchTool = invocation.name === WEB_SEARCH_TOOL_NAME;
  const isWorkspaceTreeTool =
    invocation.name === GET_WORKSPACE_TREE_TOOL_NAME;
  const isGlobTool = invocation.name === GLOB_TOOL_NAME;
  const isListDirTool = invocation.name === LIST_DIR_TOOL_NAME;
  const isTodoTool =
    invocation.name === TODO_READ_TOOL_NAME ||
    invocation.name === TODO_WRITE_TOOL_NAME;
  const isPlanTool =
    invocation.name === PLAN_CREATE_TOOL_NAME ||
    invocation.name === PLAN_READ_TOOL_NAME ||
    invocation.name === PLAN_UPDATE_TOOL_NAME ||
    invocation.name === PLAN_EDIT_TOOL_NAME ||
    invocation.name === PLAN_DELETE_TOOL_NAME ||
    invocation.name === PLAN_LIST_TOOL_NAME;
  const isInlineTool =
    isFileDiffTool || isShellTool || isReadFileTool || isGrepTool ||
    isWebSearchTool || isGlobTool || isListDirTool || isTodoTool || isPlanTool;

  // High-frequency tools render inline directly in the message.
  if (isInlineTool) {
    const hasContent = Boolean(invocation.output) || Boolean(invocation.errorText);

    if (!hasContent) {
      return (
        <div className={cn("not-prose my-2 w-full", className)}>
          <div className="inline-flex items-center gap-1.5 rounded-md border border-border/70 bg-muted/40 px-2 py-1 font-mono text-xs text-foreground">
            <ToolStatusIcon state={invocation.state as ToolUIPart["state"]} />
            <span>{chipLabel}</span>
          </div>
        </div>
      );
    }

    return (
      <div className={cn("not-prose my-2 w-full", className)}>
        {isFileDiffTool ? (
          <FileDiffToolOutput
            errorText={invocation.errorText}
            input={invocation.input}
            output={invocation.output}
            toolName={invocation.name}
            state={invocation.state as ToolUIPart["state"]}
          />
        ) : isShellTool ? (
          <ShellOutput
            errorText={invocation.errorText}
            input={invocation.input}
            output={invocation.output}
            toolName={invocation.name}
            state={invocation.state as ToolUIPart["state"]}
          />
        ) : isReadFileTool ? (
          <ReadFileToolOutput
            errorText={invocation.errorText}
            input={invocation.input}
            output={invocation.output}
            toolName={invocation.name}
            state={invocation.state as ToolUIPart["state"]}
          />
        ) : isGrepTool ? (
          <GrepToolOutput
            errorText={invocation.errorText}
            input={invocation.input}
            output={invocation.output}
            toolName={invocation.name}
            state={invocation.state as ToolUIPart["state"]}
          />
        ) : isWebSearchTool ? (
          <WebSearchToolOutput
            errorText={invocation.errorText}
            input={invocation.input}
            output={invocation.output}
            toolName={invocation.name}
            state={invocation.state as ToolUIPart["state"]}
          />
        ) : isGlobTool ? (
          <GlobToolOutput
            errorText={invocation.errorText}
            input={invocation.input}
            output={invocation.output}
            toolName={invocation.name}
            state={invocation.state as ToolUIPart["state"]}
          />
        ) : isListDirTool ? (
          <ListDirToolOutput
            errorText={invocation.errorText}
            input={invocation.input}
            output={invocation.output}
            toolName={invocation.name}
            state={invocation.state as ToolUIPart["state"]}
          />
        ) : isTodoTool ? (
          <TodoToolOutput
            errorText={invocation.errorText}
            input={invocation.input}
            output={invocation.output}
            toolName={invocation.name}
            state={invocation.state as ToolUIPart["state"]}
          />
        ) : (
          <PlanToolOutput
            errorText={invocation.errorText}
            input={invocation.input}
            output={invocation.output}
            toolName={invocation.name}
            state={invocation.state as ToolUIPart["state"]}
          />
        )}
      </div>
    );
  }

  return (
    <>
      <button
        className={cn(
          "inline-flex items-center gap-1.5 rounded-md border border-border/70 bg-muted/40 px-2 py-1",
          "font-mono text-xs text-foreground transition-colors hover:bg-muted",
          className,
        )}
        onClick={() => setOpen(true)}
        type="button"
      >
        <ToolStatusIcon state={invocation.state as ToolUIPart["state"]} />
        <span>{chipLabel}</span>
      </button>
      <Sheet onOpenChange={setOpen} open={open}>
        <SheetContent className="w-full overflow-y-auto data-[side=right]:sm:max-w-2xl">
          <SheetHeader>
            <SheetTitle>
              {t("chat.toolDetailTitle", { name: invocation.name })}
            </SheetTitle>
          </SheetHeader>
          <div className="space-y-4 px-4 pb-4">
            <ToolInput input={invocation.input} />
            {isBrowsePageTool && invocation.output ? (
              <BrowsePageToolOutput output={invocation.output} />
            ) : null}
            {isWorkspaceTreeTool && invocation.output ? (
              <WorkspaceTreeToolOutput output={invocation.output} />
            ) : null}
            <ToolOutput
              errorText={invocation.errorText}
              output={
                isBrowsePageTool || isWorkspaceTreeTool
                  ? undefined
                  : invocation.output
              }
            />
          </div>
        </SheetContent>
      </Sheet>
    </>
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
