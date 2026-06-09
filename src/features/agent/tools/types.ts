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

export type ReadFileData = {
  path: string;
  encoding: string;
  mimeType: string;
  totalLines: number;
  startLine: number;
  endLine: number;
  truncated: boolean;
  containsSecrets: boolean;
  content: string;
};

export type ReadFileToolErrorPayload = {
  code: string;
  message: string;
  mimeType?: string;
  size?: number;
};

export type ToolExecutionContext = {
  workspaceDir: string | null;
};

export type ToolHandler = (
  args: unknown,
  context: ToolExecutionContext
) => Promise<ToolResultEnvelope>;
