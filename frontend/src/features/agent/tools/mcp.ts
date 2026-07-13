import { callMcpTool } from "@/features/mcp/api";
import { parseMcpToolName } from "@/features/mcp/lib/tool-naming";
import { getMcpServer } from "@/lib/db/mcp-servers";
import type { ToolExecutionContext } from "./types";
import type { ToolResultEnvelope } from "./result";
import { toolFailure, toolSuccess } from "./result";

type McpToolCallData = {
  serverId: string;
  serverName: string;
  toolName: string;
  text: string;
  content: Array<{
    type: string;
    text?: string;
    data?: string;
    mimeType?: string;
    uri?: string;
  }>;
  isError: boolean;
};

function contentBlocksToText(
  content: McpToolCallData["content"]
): string {
  const parts: string[] = [];

  for (const block of content) {
    if (block.type === "text" && block.text) {
      parts.push(block.text);
      continue;
    }

    if (block.type === "image" && block.data) {
      parts.push(`[image ${block.mimeType ?? "unknown"}: ${block.data.length} bytes]`);
      continue;
    }

    if (block.type === "resource" && block.uri) {
      if (block.text) {
        parts.push(`[resource ${block.uri}]\n${block.text}`);
      } else {
        parts.push(`[resource ${block.uri}]`);
      }
    }
  }

  return parts.join("\n\n");
}

export async function executeMcpToolCall(
  toolName: string,
  args: unknown,
  context: ToolExecutionContext
): Promise<ToolResultEnvelope<McpToolCallData>> {
  const parsed = parseMcpToolName(toolName);
  if (!parsed) {
    return toolFailure(toolName, "invalid_mcp_tool", "Invalid MCP tool name");
  }

  const server = await getMcpServer(parsed.serverId);
  if (!server) {
    return toolFailure(
      toolName,
      "mcp_server_not_found",
      `MCP server not found: ${parsed.serverId}`
    );
  }

  if (!server.enabled) {
    return toolFailure(
      toolName,
      "mcp_server_disabled",
      `MCP server is disabled: ${server.name}`
    );
  }

  if (context.signal?.aborted) {
    return toolFailure(toolName, "cancelled", "MCP tool call was cancelled");
  }

  const argumentsRecord =
    args && typeof args === "object" && !Array.isArray(args)
      ? (args as Record<string, unknown>)
      : {};

  try {
    const result = await callMcpTool({
      config: server,
      toolName: parsed.toolName,
      arguments: argumentsRecord,
    });

    const content = result.content.map((block) => {
      if (block.type === "text") {
        return { type: block.type, text: block.text };
      }
      if (block.type === "image") {
        return {
          type: block.type,
          data: block.data,
          mimeType: block.mimeType,
        };
      }
      return {
        type: block.type,
        uri: block.uri,
        mimeType: block.mimeType,
        text: block.text,
      };
    });

    const text = contentBlocksToText(content);

    return toolSuccess(toolName, {
      serverId: server.id,
      serverName: server.name,
      toolName: parsed.toolName,
      text,
      content,
      isError: result.isError,
    });
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    return toolFailure(toolName, "mcp_call_failed", message);
  }
}
