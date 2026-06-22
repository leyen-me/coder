"use client";

import { ToolInput, ToolOutput } from "@/components/ai-elements/tool";
import {
  Sheet,
  SheetContent,
  SheetHeader,
  SheetTitle,
} from "@/components/ui/sheet";
import {
  ASK_QUESTION_TOOL_NAME,
  AWAIT_TOOL_NAME,
  BROWSE_PAGE_TOOL_NAME,
  CREATE_SKILL_TOOL_NAME,
  EDIT_FILE_TOOL_NAME,
  GET_WORKSPACE_TREE_TOOL_NAME,
  GLOB_TOOL_NAME,
  GREP_TOOL_NAME,
  KILL_SHELL_TOOL_NAME,
  LIST_DIR_TOOL_NAME,
  LIST_SHELLS_TOOL_NAME,
  LIST_SKILLS_TOOL_NAME,
  PLAN_CREATE_TOOL_NAME,
  PLAN_DELETE_TOOL_NAME,
  PLAN_EDIT_TOOL_NAME,
  PLAN_LIST_TOOL_NAME,
  PLAN_READ_TOOL_NAME,
  PLAN_UPDATE_TOOL_NAME,
  READ_FILE_TOOL_NAME,
  READ_SHELL_LOGS_TOOL_NAME,
  READ_SKILL_TOOL_NAME,
  REPLACE_FILE_TOOL_NAME,
  SHELL_TOOL_NAME,
  TODO_READ_TOOL_NAME,
  TODO_WRITE_TOOL_NAME,
  UPDATE_SKILL_TOOL_NAME,
  WEB_SEARCH_TOOL_NAME,
  WRITE_FILE_TOOL_NAME,
  SPAWN_SUBAGENT_TOOL_NAME,
} from "@/features/agent/tools/definitions";
import { getAskQuestionChipLabel } from "@/features/agent/tools/ask-question-display";
import { getBrowsePageChipLabel } from "@/features/agent/tools/browse-page-display";
import { getFileDiffChipLabel } from "@/features/agent/tools/file-diff-display";
import { getGlobChipLabel } from "@/features/agent/tools/glob-display";
import { getGrepChipLabel } from "@/features/agent/tools/grep-display";
import { getListDirChipLabel } from "@/features/agent/tools/list-dir-display";
import { getPlanChipLabel } from "@/features/agent/tools/plan-display";
import {
  getReadFileChipLabel,
} from "@/features/agent/tools/read-file-display";
import {
  getSendEmailChipLabel,
} from "@/features/agent/tools/send-email-display";
import { getShellChipLabel } from "@/features/agent/tools/shell-display";
import {
  getKillShellChipLabel,
  getListShellsChipLabel,
  getReadShellLogsChipLabel,
} from "@/features/agent/tools/shell-management-display";
import { getSkillChipLabel } from "@/features/agent/tools/skill-display";
import { getTodoChipLabel } from "@/features/agent/tools/todo-display";
import { getWebSearchChipLabel } from "@/features/agent/tools/web-search-display";
import { getWorkspaceTreeChipLabel } from "@/features/agent/tools/workspace-tree-display";
import { getSubAgentChipLabel } from "@/features/agent/tools/spawn-subagent-display";
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

import { AskQuestionToolOutput } from "./ask-question-tool-output";
import { BrowsePageToolOutput } from "./browse-page-tool-output";
import { FileDiffToolOutput } from "./file-diff-tool-output";
import { GlobToolOutput } from "./glob-tool-output";
import { GrepToolOutput } from "./grep-tool-output";
import { KillShellToolOutput } from "./kill-shell-tool-output";
import { ListDirToolOutput } from "./list-dir-tool-output";
import { ListShellsToolOutput } from "./list-shells-tool-output";
import { PlanToolOutput } from "./plan-tool-output";
import { ReadFileToolOutput } from "./read-file-tool-output";
import { ReadShellLogsToolOutput } from "./read-shell-logs-tool-output";

import { ShellOutput } from "./shell-output";
import { SkillToolOutput } from "./skill-tool-output";
import { TodoToolOutput } from "./todo-tool-output";
import { WebSearchToolOutput } from "./web-search-tool-output";
import { WorkspaceTreeToolOutput } from "./workspace-tree-tool-output";
import { SubAgentToolOutput } from "./sub-agent-tool-output";

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
    getAskQuestionChipLabel(invocation.name, invocation.output) ??
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
    getListShellsChipLabel(invocation.name, invocation.input, invocation.output) ??
    getReadShellLogsChipLabel(invocation.name, invocation.input, invocation.output) ??
    getKillShellChipLabel(invocation.name, invocation.input, invocation.output) ??
    getSkillChipLabel(invocation.name, invocation.input, invocation.output) ??
    getSendEmailChipLabel(invocation.name, invocation.input, invocation.output) ??
    getWorkspaceTreeChipLabel(invocation.name, invocation.output) ??
    getSubAgentChipLabel(invocation.name, invocation.input, invocation.output) ??
    invocation.name;

  // Tool type checks — used for specialized output rendering inside the Sheet.
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
  const isListShellsTool = invocation.name === LIST_SHELLS_TOOL_NAME;
  const isReadShellLogsTool = invocation.name === READ_SHELL_LOGS_TOOL_NAME;
  const isKillShellTool = invocation.name === KILL_SHELL_TOOL_NAME;
  const isSkillTool =
    invocation.name === LIST_SKILLS_TOOL_NAME ||
    invocation.name === READ_SKILL_TOOL_NAME ||
    invocation.name === CREATE_SKILL_TOOL_NAME ||
    invocation.name === UPDATE_SKILL_TOOL_NAME;
  const isAskQuestionTool = invocation.name === ASK_QUESTION_TOOL_NAME;
  const isSubAgentTool = invocation.name === SPAWN_SUBAGENT_TOOL_NAME;

  // Collect all specialized tools so we know when NOT to render the generic fallback.
  const specializedTools = [
    isFileDiffTool, isShellTool, isReadFileTool, isGrepTool,
    isWebSearchTool, isGlobTool, isListDirTool, isTodoTool, isPlanTool,
    isListShellsTool, isReadShellLogsTool, isKillShellTool, isSkillTool,
    isAskQuestionTool, isSubAgentTool, isBrowsePageTool,
  ];
  const hasSpecializedOutput = specializedTools.some(Boolean);

  return (
    <>
      {/* Text-like inline trigger — styled like an <a> tag with a tool-specific color */}
      <button
        className={cn(
          "inline items-center gap-1 font-mono text-xs",
          "text-sky-600 underline decoration-dotted underline-offset-2 transition-colors",
          "hover:text-sky-500 hover:decoration-solid",
          "dark:text-sky-400 dark:hover:text-sky-300",
          className,
        )}
        onClick={() => setOpen(true)}
        type="button"
      >
        <ToolStatusIcon state={invocation.state as ToolUIPart["state"]} />
        <span>{chipLabel}</span>
      </button>

      {/* Sheet with full tool details */}
      <Sheet onOpenChange={setOpen} open={open}>
        <SheetContent className="w-full overflow-y-auto data-[side=right]:sm:max-w-2xl">
          <SheetHeader>
            <SheetTitle>
              {t("chat.toolDetailTitle", { name: invocation.name })}
            </SheetTitle>
          </SheetHeader>
          <div className="space-y-4 px-4 pb-4">
            <ToolInput input={invocation.input} />

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
            ) : isPlanTool ? (
              <PlanToolOutput
                errorText={invocation.errorText}
                input={invocation.input}
                output={invocation.output}
                toolName={invocation.name}
                state={invocation.state as ToolUIPart["state"]}
              />
            ) : isListShellsTool ? (
              <ListShellsToolOutput
                errorText={invocation.errorText}
                input={invocation.input}
                output={invocation.output}
                toolName={invocation.name}
                state={invocation.state as ToolUIPart["state"]}
              />
            ) : isReadShellLogsTool ? (
              <ReadShellLogsToolOutput
                errorText={invocation.errorText}
                input={invocation.input}
                output={invocation.output}
                toolName={invocation.name}
                state={invocation.state as ToolUIPart["state"]}
              />
            ) : isKillShellTool ? (
              <KillShellToolOutput
                errorText={invocation.errorText}
                input={invocation.input}
                output={invocation.output}
                toolName={invocation.name}
                state={invocation.state as ToolUIPart["state"]}
              />
            ) : isWorkspaceTreeTool ? (
              <WorkspaceTreeToolOutput
                errorText={invocation.errorText}
                output={invocation.output}
                toolName={invocation.name}
                state={invocation.state as ToolUIPart["state"]}
              />
            ) : isSkillTool ? (
              <SkillToolOutput
                errorText={invocation.errorText}
                output={invocation.output}
                toolName={invocation.name}
                state={invocation.state as ToolUIPart["state"]}
              />
            ) : isAskQuestionTool ? (
              <AskQuestionToolOutput
                errorText={invocation.errorText}
                output={invocation.output}
                toolName={invocation.name}
                state={invocation.state as ToolUIPart["state"]}
              />
            ) : isSubAgentTool ? (
              <SubAgentToolOutput
                errorText={invocation.errorText}
                input={invocation.input}
                output={invocation.output}
              />
            ) : isBrowsePageTool && invocation.output ? (
              <BrowsePageToolOutput output={invocation.output} />
            ) : null}

            {/* Generic fallback — rendered when none of the specialized outputs apply */}
            {!hasSpecializedOutput ? (
              <ToolOutput
                errorText={invocation.errorText}
                output={invocation.output}
              />
            ) : null}
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
        <CheckCircle2Icon className="mr-0.5 inline size-3 shrink-0 text-green-600 align-middle" />
      );
    case "output-error":
      return (
        <XCircleIcon className="mr-0.5 inline size-3 shrink-0 text-destructive align-middle" />
      );
    case "input-streaming":
    case "input-available":
      return (
        <LoaderCircleIcon className="mr-0.5 inline size-3 shrink-0 animate-spin text-muted-foreground align-middle" />
      );
    default:
      return (
        <CircleIcon className="mr-0.5 inline size-3 shrink-0 text-muted-foreground align-middle" />
      );
  }
}
