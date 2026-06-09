import {
  AGENT_TOOL_DEFINITIONS,
  AWAIT_TOOL_NAME,
  EDIT_FILE_TOOL_NAME,
  GLOB_TOOL_NAME,
  GREP_TOOL_NAME,
  LIST_DIR_TOOL_NAME,
  READ_FILE_TOOL_NAME,
  REPLACE_FILE_TOOL_NAME,
  SHELL_TOOL_NAME,
  WRITE_FILE_TOOL_NAME,
} from "./definitions";
import { awaitShellHandler } from "./await-shell";
import { editFileHandler } from "./edit-file";
import { globHandler } from "./glob";
import { grepHandler } from "./grep";
import { listDirHandler } from "./list-dir";
import { readFileHandler } from "./read-file";
import { replaceFileHandler } from "./replace-file";
import { shellHandler } from "./shell";
import { writeFileHandler } from "./write-file";
import type {
  AgentToolDefinition,
  ToolExecutionContext,
  ToolHandler,
} from "./types";
import type { ToolResultEnvelope } from "./result";

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
};

export function getAgentToolDefinitions(): AgentToolDefinition[] {
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
