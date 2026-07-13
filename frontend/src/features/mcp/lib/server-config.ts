import type { McpServerConfig } from "@/lib/db/types";

export const LONGBRIDGE_MCP_URL_CN = "https://mcp.longbridge.cn";
export const LONGBRIDGE_MCP_URL_GLOBAL = "https://mcp.longbridge.com";

type LegacyMcpServerConfig = Partial<McpServerConfig> &
  Pick<McpServerConfig, "id" | "name">;

export function normalizeMcpServerConfig(
  config: LegacyMcpServerConfig
): McpServerConfig {
  const url = config.url ?? "";
  const transport =
    config.transport ?? (url.trim().length > 0 ? "http" : "stdio");

  return {
    id: config.id,
    name: config.name,
    transport,
    command: config.command ?? "",
    args: config.args ?? [],
    env: config.env ?? {},
    url,
    headers: config.headers ?? {},
    enabled: config.enabled ?? true,
  };
}

export function createLongbridgePreset(region: "cn" | "global"): McpServerConfig {
  return {
    id: region === "cn" ? "longbridge-cn" : "longbridge",
    name: region === "cn" ? "长桥 MCP（中国大陆）" : "Longbridge MCP",
    transport: "http",
    command: "",
    args: [],
    env: {},
    url: region === "cn" ? LONGBRIDGE_MCP_URL_CN : LONGBRIDGE_MCP_URL_GLOBAL,
    headers: {},
    enabled: true,
  };
}

export function isRemoteMcpServer(server: McpServerConfig): boolean {
  const normalized = normalizeMcpServerConfig(server);
  return (
    normalized.transport === "http" || normalized.url.trim().length > 0
  );
}

export function formatHeadersLines(headers: Record<string, string>): string {
  return Object.entries(headers)
    .sort(([a], [b]) => a.localeCompare(b))
    .map(([key, value]) => `${key}=${value}`)
    .join("\n");
}

export function parseHeadersLines(value: string): Record<string, string> {
  const headers: Record<string, string> = {};
  for (const line of value.split("\n")) {
    const trimmed = line.trim();
    if (!trimmed) continue;
    const separatorIndex = trimmed.indexOf("=");
    if (separatorIndex <= 0) continue;
    const key = trimmed.slice(0, separatorIndex).trim();
    const headerValue = trimmed.slice(separatorIndex + 1).trim();
    if (key) headers[key] = headerValue;
  }
  return headers;
}
