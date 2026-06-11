import {
  AGENT_TOOL_DEFINITIONS,
  AWAIT_TOOL_NAME,
  EDIT_FILE_TOOL_NAME,
  GLOB_TOOL_NAME,
  GREP_TOOL_NAME,
  BROWSE_PAGE_TOOL_NAME,
  KILL_SHELL_TOOL_NAME,
  LIST_DIR_TOOL_NAME,
  LIST_SHELLS_TOOL_NAME,
  CREATE_SKILL_TOOL_NAME,
  LIST_SKILLS_TOOL_NAME,
  READ_FILE_TOOL_NAME,
  READ_SKILL_TOOL_NAME,
  REPLACE_FILE_TOOL_NAME,
  SHELL_TOOL_NAME,
  UPDATE_SKILL_TOOL_NAME,
  WEB_SEARCH_TOOL_NAME,
  WRITE_FILE_TOOL_NAME,
} from "./definitions";
import { awaitShellHandler } from "./await-shell";
import { browsePageHandler } from "./browse-page";
import { editFileHandler } from "./edit-file";
import { globHandler } from "./glob";
import { grepHandler } from "./grep";
import { killShellHandler } from "./kill-shell";
import { listDirHandler } from "./list-dir";
import { listShellsHandler } from "./list-shells";
import { createSkillHandler } from "./create-skill";
import { listSkillsHandler } from "./list-skills";
import { readFileHandler } from "./read-file";
import { readSkillHandler } from "./read-skill";
import { replaceFileHandler } from "./replace-file";
import { shellHandler } from "./shell";
import { updateSkillHandler } from "./update-skill";
import { webSearchHandler } from "./web-search";
import { writeFileHandler } from "./write-file";
import { ASK_MODE_TOOL_NAMES } from "./ask-tools";
import type {
  AgentToolDefinition,
  ToolExecutionContext,
  ToolHandler,
} from "./types";
import type { ToolResultEnvelope } from "./result";
import type { AgentMode } from "../types";

const TOOL_HANDLERS: Record<string, ToolHandler> = {
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
  [WEB_SEARCH_TOOL_NAME]: webSearchHandler,
  [BROWSE_PAGE_TOOL_NAME]: browsePageHandler,
  [LIST_SKILLS_TOOL_NAME]: listSkillsHandler,
  [READ_SKILL_TOOL_NAME]: readSkillHandler,
  [CREATE_SKILL_TOOL_NAME]: createSkillHandler,
  [UPDATE_SKILL_TOOL_NAME]: updateSkillHandler,
};

const ASK_MODE_TOOL_NAMES_SET = new Set(ASK_MODE_TOOL_NAMES);

/**
 * Returns tool definitions for the given mode.
 * - `"agent"`: all tools available (default).
 * - `"ask"`: only read-only / information-gathering tools.
 */
export function getAgentToolDefinitions(
  mode?: AgentMode
): AgentToolDefinition[] {
  if (mode === "ask") {
    return AGENT_TOOL_DEFINITIONS.filter((tool) =>
      ASK_MODE_TOOL_NAMES_SET.has(tool.function.name)
    );
  }

  return AGENT_TOOL_DEFINITIONS;
}

export function getToolHandler(name: string): ToolHandler | null {
  return TOOL_HANDLERS[name] ?? null;
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
