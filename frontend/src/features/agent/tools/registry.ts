import {
  AGENT_TOOL_DEFINITIONS,
  PLAN_CREATE_TOOL_NAME,
  PLAN_DELETE_TOOL_NAME,
  PLAN_EDIT_TOOL_NAME,
  PLAN_LIST_TOOL_NAME,
  PLAN_READ_TOOL_NAME,
  PLAN_UPDATE_TOOL_NAME,
} from "./definitions";
import { ASK_MODE_TOOL_NAMES } from "./ask-tools";
import { PLAN_MODE_TOOL_NAMES } from "./plan-tools";
import type { AgentToolDefinition } from "./types";
import type { AgentMode } from "../types";

const ASK_MODE_TOOL_NAMES_SET = new Set(ASK_MODE_TOOL_NAMES);
const PLAN_MODE_TOOL_NAMES_SET = new Set(PLAN_MODE_TOOL_NAMES);
const AGENT_MODE_EXCLUDED_TOOL_NAMES_SET = new Set([
  PLAN_CREATE_TOOL_NAME,
  PLAN_READ_TOOL_NAME,
  PLAN_UPDATE_TOOL_NAME,
  PLAN_EDIT_TOOL_NAME,
  PLAN_DELETE_TOOL_NAME,
  PLAN_LIST_TOOL_NAME,
]);

/**
 * Returns tool definitions for the given mode.
 * - `"agent"`: all tools except plan file management helpers.
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

