import { apiPost } from "@/lib/api/client";
import type { McpServerConfig } from "@/lib/db/types";

export type McpToolDefinition = {
  name: string;
  description?: string;
  inputSchema?: Record<string, unknown>;
};

export type McpListToolsResult = {
  serverId: string;
  serverName: string;
  tools: McpToolDefinition[];
};

export type McpContentBlock =
  | { type: "text"; text: string }
  | { type: "image"; data: string; mimeType: string }
  | {
      type: "resource";
      uri: string;
      mimeType?: string;
      text?: string;
    };

export type McpCallToolResult = {
  serverId: string;
  toolName: string;
  content: McpContentBlock[];
  isError: boolean;
};

export type McpTestConnectionResult = {
  ok: boolean;
  message: string;
  toolCount: number;
};

export async function listMcpTools(
  config: McpServerConfig
): Promise<McpListToolsResult> {
  return apiPost<McpListToolsResult>("/api/mcp/list_tools", { config });
}

export async function callMcpTool(input: {
  config: McpServerConfig;
  toolName: string;
  arguments: Record<string, unknown>;
}): Promise<McpCallToolResult> {
  return apiPost<McpCallToolResult>("/api/mcp/call_tool", {
    config: input.config,
    toolName: input.toolName,
    arguments: input.arguments,
  });
}

export async function testMcpConnection(
  config: McpServerConfig
): Promise<McpTestConnectionResult> {
  return apiPost<McpTestConnectionResult>("/api/mcp/test_connection", {
    config,
  });
}

export async function disconnectMcpServer(serverId: string): Promise<void> {
  await apiPost("/api/mcp/disconnect", { serverId });
}
