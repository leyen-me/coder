import { MCP_SERVERS_STORE } from "./constants";
import { getDb } from "./client";
import { notifyDbChange } from "./subscriptions";
import type { McpServerConfig } from "./types";
import { normalizeMcpServerConfig } from "@/features/mcp/lib/server-config";

export async function listMcpServers(): Promise<McpServerConfig[]> {
  const db = await getDb();
  const servers = await db.getAll<McpServerConfig>(MCP_SERVERS_STORE);
  return servers
    .map((server) => normalizeMcpServerConfig(server))
    .sort((a, b) => a.name.localeCompare(b.name));
}

export async function getMcpServer(id: string): Promise<McpServerConfig | null> {
  const db = await getDb();
  const server = await db.get<McpServerConfig>(MCP_SERVERS_STORE, id);
  return server ? normalizeMcpServerConfig(server) : null;
}

export async function saveMcpServer(config: McpServerConfig): Promise<void> {
  const db = await getDb();
  await db.put(MCP_SERVERS_STORE, config);
  notifyDbChange();
}

export async function deleteMcpServer(id: string): Promise<boolean> {
  const db = await getDb();
  const existing = await db.get<McpServerConfig>(MCP_SERVERS_STORE, id);
  if (!existing) {
    return false;
  }

  await db.delete(MCP_SERVERS_STORE, id);
  notifyDbChange();
  return true;
}
