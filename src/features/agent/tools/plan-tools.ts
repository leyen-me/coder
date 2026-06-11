import { ASK_MODE_TOOL_NAMES } from "./ask-tools";
import { TODO_WRITE_TOOL_NAME } from "./definitions";

/**
 * Tools available in "plan" mode.
 * Read-only exploration plus todo tracking for structured planning.
 */
export const PLAN_MODE_TOOL_NAMES: readonly string[] = [
  ...ASK_MODE_TOOL_NAMES,
  TODO_WRITE_TOOL_NAME,
] as const;
