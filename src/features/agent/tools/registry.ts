import {
  AGENT_TOOL_DEFINITIONS,
  ASK_QUESTION_TOOL_NAME,
  AWAIT_TOOL_NAME,
  EDIT_FILE_TOOL_NAME,
  GLOB_TOOL_NAME,
  GREP_TOOL_NAME,
  BROWSE_PAGE_TOOL_NAME,
  KILL_SHELL_TOOL_NAME,
  READ_SHELL_LOGS_TOOL_NAME,
  LIST_DIR_TOOL_NAME,
  LIST_SHELLS_TOOL_NAME,
  CREATE_SKILL_TOOL_NAME,
  LIST_SKILLS_TOOL_NAME,
  TODO_READ_TOOL_NAME,
  PLAN_CREATE_TOOL_NAME,
  PLAN_DELETE_TOOL_NAME,
  PLAN_EDIT_TOOL_NAME,
  PLAN_LIST_TOOL_NAME,
  PLAN_READ_TOOL_NAME,
  PLAN_UPDATE_TOOL_NAME,
  READ_FILE_TOOL_NAME,
  READ_SKILL_TOOL_NAME,
  REPLACE_FILE_TOOL_NAME,
  SEND_EMAIL_TOOL_NAME,
  SHELL_TOOL_NAME,
  TODO_WRITE_TOOL_NAME,
  UPDATE_SKILL_TOOL_NAME,
  WEB_SEARCH_TOOL_NAME,
  WRITE_FILE_TOOL_NAME,
  GET_WORKSPACE_TREE_TOOL_NAME,
  SPAWN_SUBAGENT_TOOL_NAME,
} from "./definitions";
import { awaitShellHandler } from "./await-shell";
import { askQuestionHandler } from "./ask-question";
import { browsePageHandler } from "./browse-page";
import { editFileHandler } from "./edit-file";
import { getWorkspaceTreeHandler } from "./get-workspace-tree";
import { globHandler } from "./glob";
import { grepHandler } from "./grep";
import { killShellHandler } from "./kill-shell";
import { listDirHandler } from "./list-dir";
import { listShellsHandler } from "./list-shells";
import { createSkillHandler } from "./create-skill";
import { listSkillsHandler } from "./list-skills";
import {
  planCreateHandler,
  planDeleteHandler,
  planEditHandler,
  planListHandler,
  planReadHandler,
  planUpdateHandler,
} from "./plan";
import { readFileHandler } from "./read-file";
import { readShellLogsHandler } from "./read-shell-logs";
import { readSkillHandler } from "./read-skill";
import { replaceFileHandler } from "./replace-file";
import { sendEmailHandler } from "./send-email";
import { shellHandler } from "./shell";
import { todoReadHandler } from "./todo-read";
import { todoWriteHandler } from "./todo-write";
import { updateSkillHandler } from "./update-skill";
import { webSearchHandler } from "./web-search";
import { writeFileHandler } from "./write-file";
import { spawnSubAgentHandler } from "./spawn-subagent";
import { ASK_MODE_TOOL_NAMES } from "./ask-tools";
import { PLAN_MODE_TOOL_NAMES } from "./plan-tools";
import type {
  AgentToolDefinition,
  ToolExecutionContext,
  ToolHandler,
} from "./types";
import type { ToolResultEnvelope } from "./result";
import type { AgentMode } from "../types";

const TOOL_HANDLERS: Record<string, ToolHandler> = {
  [ASK_QUESTION_TOOL_NAME]: askQuestionHandler,
  [LIST_DIR_TOOL_NAME]: listDirHandler,
  [READ_FILE_TOOL_NAME]: readFileHandler,
  [WRITE_FILE_TOOL_NAME]: writeFileHandler,
  [REPLACE_FILE_TOOL_NAME]: replaceFileHandler,
  [EDIT_FILE_TOOL_NAME]: editFileHandler,
  [GLOB_TOOL_NAME]: globHandler,
  [GREP_TOOL_NAME]: grepHandler,
  [SHELL_TOOL_NAME]: shellHandler,
  [AWAIT_TOOL_NAME]: awaitShellHandler,
  [LIST_SHELLS_TOOL_NAME]: listShellsHandler,
  [KILL_SHELL_TOOL_NAME]: killShellHandler,
  [READ_SHELL_LOGS_TOOL_NAME]: readShellLogsHandler,
  [WEB_SEARCH_TOOL_NAME]: webSearchHandler,
  [BROWSE_PAGE_TOOL_NAME]: browsePageHandler,
  [LIST_SKILLS_TOOL_NAME]: listSkillsHandler,
  [READ_SKILL_TOOL_NAME]: readSkillHandler,
  [CREATE_SKILL_TOOL_NAME]: createSkillHandler,
  [UPDATE_SKILL_TOOL_NAME]: updateSkillHandler,
  [TODO_READ_TOOL_NAME]: todoReadHandler,
  [TODO_WRITE_TOOL_NAME]: todoWriteHandler,
  [GET_WORKSPACE_TREE_TOOL_NAME]: getWorkspaceTreeHandler,
  [PLAN_CREATE_TOOL_NAME]: planCreateHandler,
  [PLAN_READ_TOOL_NAME]: planReadHandler,
  [PLAN_UPDATE_TOOL_NAME]: planUpdateHandler,
  [PLAN_EDIT_TOOL_NAME]: planEditHandler,
  [PLAN_DELETE_TOOL_NAME]: planDeleteHandler,
  [PLAN_LIST_TOOL_NAME]: planListHandler,
  [SEND_EMAIL_TOOL_NAME]: sendEmailHandler,
  [SPAWN_SUBAGENT_TOOL_NAME]: spawnSubAgentHandler,
};

const ASK_MODE_TOOL_NAMES_SET = new Set(ASK_MODE_TOOL_NAMES);
const PLAN_MODE_TOOL_NAMES_SET = new Set(PLAN_MODE_TOOL_NAMES);
const AGENT_MODE_EXCLUDED_TOOL_NAMES_SET = new Set([
  ASK_QUESTION_TOOL_NAME,
  SEND_EMAIL_TOOL_NAME,
  PLAN_CREATE_TOOL_NAME,
  PLAN_READ_TOOL_NAME,
  PLAN_UPDATE_TOOL_NAME,
  PLAN_EDIT_TOOL_NAME,
  PLAN_DELETE_TOOL_NAME,
  PLAN_LIST_TOOL_NAME,
]);

/**
 * Returns tool definitions for the given mode.
 * - `"agent"`: all tools except plan-only interaction helpers.
 * - `"ask"`: only read-only / information-gathering tools.
 * - `"plan"`: read-only tools plus plan file management and todo_write.
 */
export function getAgentToolDefinitions(
  mode?: AgentMode
): AgentToolDefinition[] {
  if (mode === "ask") {
    return AGENT_TOOL_DEFINITIONS.filter((tool) =>
      ASK_MODE_TOOL_NAMES_SET.has(tool.function.name)
    );
  }

  if (mode === "plan") {
    return AGENT_TOOL_DEFINITIONS.filter((tool) =>
      PLAN_MODE_TOOL_NAMES_SET.has(tool.function.name)
    );
  }

  return AGENT_TOOL_DEFINITIONS.filter(
    (tool) => !AGENT_MODE_EXCLUDED_TOOL_NAMES_SET.has(tool.function.name)
  );
}

export function getToolHandler(name: string): ToolHandler | null {
  return TOOL_HANDLERS[name] ?? null;
}

/**
 * Checks whether the given tool name is allowed in the given mode.
 * When mode is undefined, all tools are allowed (backward-compatible).
 */
function isToolAllowedInMode(toolName: string, mode?: AgentMode): boolean {
  if (!mode) {
    return true; // No mode constraint — allow all (e.g. legacy callers)
  }

  if (mode === "ask") {
    return ASK_MODE_TOOL_NAMES_SET.has(toolName);
  }

  if (mode === "plan") {
    return PLAN_MODE_TOOL_NAMES_SET.has(toolName);
  }

  // Agent mode: exclude plan-only tools
  return !AGENT_MODE_EXCLUDED_TOOL_NAMES_SET.has(toolName);
}

export async function executeToolCall(
  name: string,
  rawArguments: string,
  context: ToolExecutionContext
): Promise<ToolResultEnvelope> {
  const handler = getToolHandler(name);
  if (!handler) {
    return {
      ok: false,
      tool: name,
      error: {
        code: "unknown_tool",
        message: `Unknown tool: ${name}`,
      },
    };
  }

  // Enforce mode-based permission at execution time,
  // unless the tool was explicitly provided in this session's tool list.
  if (
    !context.explicitlyAllowedToolNames?.has(name) &&
    !isToolAllowedInMode(name, context.agentMode)
  ) {
    const modeLabel = context.agentMode ?? "unknown";
    return {
      ok: false,
      tool: name,
      error: {
        code: "tool_not_allowed_in_mode",
        message: `Tool "${name}" is not allowed in ${modeLabel} mode.`,
      },
    };
  }

  let parsedArgs: unknown;
  try {
    parsedArgs = rawArguments.trim() ? JSON.parse(rawArguments) : {};
  } catch {
    return {
      ok: false,
      tool: name,
      error: {
        code: "invalid_arguments",
        message: "Tool arguments must be valid JSON",
      },
    };
  }

  return handler(parsedArgs, context);
}
