import type { ToolResultEnvelope } from "./result";

export type JsonSchemaObject = {
  type: "object";
  properties: Record<string, JsonSchemaProperty>;
  required?: string[];
  additionalProperties?: boolean;
};

export type JsonSchemaProperty = {
  type: "string" | "number" | "boolean" | "integer";
  description?: string;
  enum?: string[];
  default?: boolean | number | string;
};

export type AgentToolDefinition = {
  type: "function";
  function: {
    name: string;
    description: string;
    parameters: JsonSchemaObject;
  };
};

export type AgentToolCall = {
  id: string;
  name: string;
  arguments: string;
};

export type ListDirEntry = {
  name: string;
  path: string;
  isDir: boolean;
  size?: number;
};

export type ListDirData = {
  path: string;
  entries: ListDirEntry[];
};

export type ToolExecutionContext = {
  workspaceDir: string | null;
};

export type ToolHandler = (
  args: unknown,
  context: ToolExecutionContext
) => Promise<ToolResultEnvelope>;
