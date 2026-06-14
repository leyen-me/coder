import {
  LIST_DIR_TOOL_NAME,
  READ_FILE_TOOL_NAME,
  TODO_READ_TOOL_NAME,
} from "./definitions";
import {
  GLOB_TOOL_NAME,
  GREP_TOOL_NAME,
  WEB_SEARCH_TOOL_NAME,
  BROWSE_PAGE_TOOL_NAME,
  LIST_SKILLS_TOOL_NAME,
  LIST_SHELLS_TOOL_NAME,
  READ_SKILL_TOOL_NAME,
} from "./definitions";

/**
 * Tools available in "ask" mode.
 * Only read-only / information-gathering tools are included.
 */
export const ASK_MODE_TOOL_NAMES: readonly string[] = [
  LIST_DIR_TOOL_NAME,
  READ_FILE_TOOL_NAME,
  TODO_READ_TOOL_NAME,
  GLOB_TOOL_NAME,
  GREP_TOOL_NAME,
  WEB_SEARCH_TOOL_NAME,
  BROWSE_PAGE_TOOL_NAME,
  LIST_SKILLS_TOOL_NAME,
  LIST_SHELLS_TOOL_NAME,
  READ_SKILL_TOOL_NAME,
] as const;
