import {
  CREATE_AUTOMATION_TOOL_NAME,
  DELETE_AUTOMATION_TOOL_NAME,
  LIST_AUTOMATIONS_TOOL_NAME,
  LIST_MCP_SERVERS_TOOL_NAME,
  UPDATE_AUTOMATION_TOOL_NAME,
} from "./definitions";

export type AutomationRecord = {
  id: string;
  name: string;
  description: string;
  cronExpression: string;
  prompt: string;
  workspaceDir: string | null;
  model: string;
  provider: string;
  agentMode: "agent" | "ask";
  thinkingEnabled: boolean;
  enabled: boolean;
  createdAt: number;
  updatedAt: number;
};

export type AutomationCreateResult = {
  automation: AutomationRecord;
  hint?: string;
};

const AUTOMATION_TOOLS = new Set([
  LIST_AUTOMATIONS_TOOL_NAME,
  LIST_MCP_SERVERS_TOOL_NAME,
  CREATE_AUTOMATION_TOOL_NAME,
  UPDATE_AUTOMATION_TOOL_NAME,
  DELETE_AUTOMATION_TOOL_NAME,
]);

export function getAutomationChipLabel(
  toolName: string,
  input: unknown,
  output: unknown,
): string | null {
  if (!AUTOMATION_TOOLS.has(toolName)) {
    return null;
  }

  const inputRecord = asRecord(input);
  const id = typeof inputRecord?.id === "string" ? inputRecord.id.trim() : "";
  const name =
    typeof inputRecord?.name === "string" ? inputRecord.name.trim() : "";

  switch (toolName) {
    case LIST_AUTOMATIONS_TOOL_NAME: {
      const data = extractListAutomationsData(output);
      if (data) {
        const count = data.automations.length;
        return `list_automations: ${count} automation${count !== 1 ? "s" : ""}`;
      }
      return LIST_AUTOMATIONS_TOOL_NAME;
    }

    case LIST_MCP_SERVERS_TOOL_NAME: {
      const data = extractListMcpServersData(output);
      if (data) {
        const count = data.mcpServers.length;
        return `list_mcp_servers: ${count} server${count !== 1 ? "s" : ""}`;
      }
      return LIST_MCP_SERVERS_TOOL_NAME;
    }

    case CREATE_AUTOMATION_TOOL_NAME: {
      const data = extractAutomationCreateData(output);
      if (data) {
        return `create_automation: ${data.automation.name}`;
      }
      return name ? `create_automation: ${name}` : CREATE_AUTOMATION_TOOL_NAME;
    }

    case UPDATE_AUTOMATION_TOOL_NAME: {
      const data = extractAutomationRecordData(output);
      if (data) {
        return `update_automation: ${data.name}`;
      }
      return id ? `update_automation: ${id}` : UPDATE_AUTOMATION_TOOL_NAME;
    }

    case DELETE_AUTOMATION_TOOL_NAME: {
      const deletedId =
        typeof asRecord(unwrapData(output))?.id === "string"
          ? String(asRecord(unwrapData(output))?.id)
          : id;
      return deletedId
        ? `delete_automation: ${deletedId}`
        : DELETE_AUTOMATION_TOOL_NAME;
    }

    default:
      return toolName;
  }
}

export function extractListAutomationsData(
  output: unknown,
): { automations: AutomationRecord[] } | null {
  const data = unwrapData(output);
  if (!data || !Array.isArray(data.automations)) {
    return null;
  }

  return {
    automations: data.automations as AutomationRecord[],
  };
}

export function extractListMcpServersData(
  output: unknown,
): { mcpServers: Array<{ id: string; name: string }> } | null {
  const data = unwrapData(output);
  if (!data || !Array.isArray(data.mcpServers)) {
    return null;
  }

  return {
    mcpServers: data.mcpServers as Array<{ id: string; name: string }>,
  };
}

export function extractAutomationRecordData(
  output: unknown,
): AutomationRecord | null {
  const data = unwrapData(output);
  if (!data || typeof data.automation !== "object" || data.automation === null) {
    return null;
  }

  return data.automation as AutomationRecord;
}

export function extractAutomationCreateData(
  output: unknown,
): AutomationCreateResult | null {
  const data = unwrapData(output);
  const automation = extractAutomationRecordData(output);
  if (!data || !automation) {
    return null;
  }

  return {
    automation,
    hint: typeof data.hint === "string" ? data.hint : undefined,
  };
}

function unwrapData(output: unknown): Record<string, unknown> | null {
  const envelope = asRecord(output);
  if (!envelope || envelope.ok !== true) {
    return null;
  }

  const data = envelope.data;
  if (!data || typeof data !== "object") {
    return null;
  }

  return data as Record<string, unknown>;
}

function asRecord(value: unknown): Record<string, unknown> | null {
  if (typeof value === "object" && value !== null && !Array.isArray(value)) {
    return value as Record<string, unknown>;
  }
  return null;
}
