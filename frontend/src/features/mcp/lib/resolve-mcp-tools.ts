import { listMcpTools } from "@/features/mcp/api";
import { buildMcpToolName } from "@/features/mcp/lib/tool-naming";
import { listMcpServers } from "@/lib/db/mcp-servers";
import type { McpServerConfig } from "@/lib/db/types";
import type {
  AgentToolDefinition,
  JsonSchemaObject,
  JsonSchemaProperty,
} from "@/features/agent/tools/types";

function normalizeInputSchema(
  schema: Record<string, unknown> | undefined
): JsonSchemaObject {
  if (!schema || schema.type !== "object") {
    return {
      type: "object",
      properties: {},
      additionalProperties: true,
    };
  }

  const properties: Record<string, JsonSchemaProperty> = {};
  const rawProperties = schema.properties;
  if (rawProperties && typeof rawProperties === "object") {
    for (const [key, value] of Object.entries(rawProperties)) {
      if (!value || typeof value !== "object") {
        continue;
      }
      const property = value as Record<string, unknown>;
      const type = property.type;
      if (
        type !== "string" &&
        type !== "number" &&
        type !== "boolean" &&
        type !== "integer" &&
        type !== "array" &&
        type !== "object"
      ) {
        continue;
      }

      properties[key] = {
        type,
        description:
          typeof property.description === "string"
            ? property.description
            : undefined,
        enum: Array.isArray(property.enum)
          ? property.enum.filter((item): item is string => typeof item === "string")
          : undefined,
      };
    }
  }

  return {
    type: "object",
    properties,
    required: Array.isArray(schema.required)
      ? schema.required.filter((item): item is string => typeof item === "string")
      : undefined,
    additionalProperties:
      typeof schema.additionalProperties === "boolean"
        ? schema.additionalProperties
        : true,
  };
}

export function mcpToolToAgentDefinition(
  server: McpServerConfig,
  tool: {
    name: string;
    description?: string;
    inputSchema?: Record<string, unknown>;
  }
): AgentToolDefinition {
  const prefixedName = buildMcpToolName(server.id, tool.name);
  const description = [
    `[MCP: ${server.name}]`,
    tool.description?.trim() || tool.name,
  ]
    .filter(Boolean)
    .join(" ");

  return {
    type: "function",
    function: {
      name: prefixedName,
      description,
      parameters: normalizeInputSchema(tool.inputSchema),
    },
  };
}

export async function resolveMcpAgentTools(): Promise<AgentToolDefinition[]> {
  const servers = await listMcpServers();
  const enabledServers = servers.filter((server) => server.enabled);
  if (enabledServers.length === 0) {
    return [];
  }

  const definitions: AgentToolDefinition[] = [];

  await Promise.all(
    enabledServers.map(async (server) => {
      try {
        const result = await listMcpTools(server);
        for (const tool of result.tools) {
          definitions.push(mcpToolToAgentDefinition(server, tool));
        }
      } catch {
        // Skip unreachable MCP servers during agent startup.
      }
    })
  );

  return definitions.sort((a, b) =>
    a.function.name.localeCompare(b.function.name)
  );
}
