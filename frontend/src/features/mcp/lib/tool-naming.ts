const MCP_TOOL_PREFIX = "mcp__";

export function buildMcpToolName(serverId: string, toolName: string): string {
  return `${MCP_TOOL_PREFIX}${serverId}__${toolName}`;
}

export function parseMcpToolName(
  name: string
): { serverId: string; toolName: string } | null {
  if (!name.startsWith(MCP_TOOL_PREFIX)) {
    return null;
  }

  const rest = name.slice(MCP_TOOL_PREFIX.length);
  const separatorIndex = rest.indexOf("__");
  if (separatorIndex <= 0) {
    return null;
  }

  return {
    serverId: rest.slice(0, separatorIndex),
    toolName: rest.slice(separatorIndex + 2),
  };
}

export function isMcpToolName(name: string): boolean {
  return parseMcpToolName(name) !== null;
}
