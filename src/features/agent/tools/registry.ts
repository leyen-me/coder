import { AGENT_TOOL_DEFINITIONS, LIST_DIR_TOOL_NAME } from "./definitions";
import { listDirHandler } from "./list-dir";
import type {
  AgentToolDefinition,
  ToolExecutionContext,
  ToolHandler,
} from "./types";
import type { ToolResultEnvelope } from "./result";

const TOOL_HANDLERS: Record<string, ToolHandler> = {
  [LIST_DIR_TOOL_NAME]: listDirHandler,
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
