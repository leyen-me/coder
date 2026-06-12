import { ASK_MODE_TOOL_NAMES } from "./ask-tools";
import {
  PLAN_CREATE_TOOL_NAME,
  PLAN_DELETE_TOOL_NAME,
  PLAN_LIST_TOOL_NAME,
  PLAN_READ_TOOL_NAME,
  PLAN_UPDATE_TOOL_NAME,
  TODO_WRITE_TOOL_NAME,
} from "./definitions";

/**
 * Tools available in "plan" mode.
 * Read-only exploration, plan file management, and todo tracking.
 */
export const PLAN_MODE_TOOL_NAMES: readonly string[] = [
  ...ASK_MODE_TOOL_NAMES,
  TODO_WRITE_TOOL_NAME,
  PLAN_CREATE_TOOL_NAME,
  PLAN_READ_TOOL_NAME,
  PLAN_UPDATE_TOOL_NAME,
  PLAN_DELETE_TOOL_NAME,
  PLAN_LIST_TOOL_NAME,
] as const;
