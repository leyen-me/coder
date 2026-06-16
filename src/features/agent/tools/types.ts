import type { ToolResultEnvelope } from "./result";

export type JsonSchemaObject = {
  type: "object";
  properties: Record<string, JsonSchemaProperty>;
  required?: string[];
  additionalProperties?: boolean;
};

export type JsonSchemaProperty = {
  type: "string" | "number" | "boolean" | "integer" | "array" | "object";
  description?: string;
  enum?: string[];
  default?: boolean | number | string;
  items?: JsonSchemaObject | JsonSchemaProperty;
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
  sha256: string;
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

export type WriteFileData = {
  path: string;
  action: "created";
  sha256: string;
  bytesWritten: number;
  linesAdded: number;
  linesRemoved: number;
  backupPath?: string;
  warning?: string;
};

export type WriteFileToolErrorPayload = {
  code: string;
  message: string;
  size?: number;
};

export type FileModifyData = {
  path: string;
  action: "replaced" | "modified";
  sha256: string;
  bytesWritten: number;
  linesAdded: number;
  linesRemoved: number;
  backupPath?: string;
  warning?: string;
};

export type FileModifyToolErrorPayload = {
  code: string;
  message: string;
  size?: number;
};

export type GlobData = {
  pattern: string;
  targetDirectory: string;
  matches: string[];
  totalMatches: number;
  truncated: boolean;
};

export type GrepContentMatch = {
  path: string;
  lineNumber: number;
  line: string;
  contextBefore?: string[];
  contextAfter?: string[];
};

export type GrepCountMatch = {
  path: string;
  count: number;
};

export type GrepData = {
  pattern: string;
  path: string;
  outputMode: string;
  matches?: GrepContentMatch[];
  files?: string[];
  counts?: GrepCountMatch[];
  totalMatches: number;
  truncated: boolean;
  skippedFiles?: number;
};

export type ShellStatus =
  | "running"
  | "completed"
  | "failed"
  | "timeout"
  | "cancelled";

export type SessionSource = "human" | "agent";

export type ShellData = {
  command: string;
  description?: string;
  workingDirectory: string;
  stdout: string;
  stderr: string;
  stdoutTruncated: boolean;
  stderrTruncated: boolean;
  stdoutTotalBytes: number;
  stderrTotalBytes: number;
  exitCode?: number;
  durationMs: number;
  status: ShellStatus;
  shellId?: string;
  source: SessionSource;
};

export type ShellInfo = {
  shellId: string;
  command: string;
  description?: string;
  workingDirectory: string;
  status: ShellStatus;
  exitCode?: number;
  startedAtMs: number;
  taskId?: string;
  stdout?: string;
  stderr?: string;
  source: SessionSource;
};

export type ListShellsEntry = {
  shellId: string;
  command: string;
  description?: string;
  workingDirectory: string;
  status: ShellStatus;
  exitCode?: number;
  startedAtMs: number;
  taskId?: string;
  stdout: string;
  stderr: string;
  stdoutTruncated: boolean;
  stderrTruncated: boolean;
  source: SessionSource;
};

export type ListShellsData = {
  shells: ListShellsEntry[];
  total: number;
};

export type KillShellData = {
  shellId: string;
  killed: boolean;
};

export type TavilyConfig = {
  apiKeySource: "manual" | "env";
  apiKey: string;
  apiKeyEnvVar: string;
};

export type WebSearchResultItem = {
  title: string;
  url: string;
  snippet: string;
  score?: number;
};

export type WebSearchData = {
  query: string;
  results: WebSearchResultItem[];
  answer?: string;
};

export type BrowsePageData = {
  url: string;
  finalUrl: string;
  title?: string;
  content: string;
  truncated: boolean;
  statusCode: number;
  contentType?: string;
};

export type TodoSnapshotItem = {
  id: string;
  content: string;
  status: "pending" | "in_progress" | "completed" | "cancelled";
};

export type TodoReadData = {
  sessionId: string;
  todos: TodoSnapshotItem[];
  total: number;
  active: number;
  completed: number;
};

export type ToolExecutionContext = {
  workspaceDir: string | null;
  sessionId?: string;
  taskId?: string;
  signal?: AbortSignal;
  tavilyConfig?: TavilyConfig | null;
  allowPrivateNetworkAccess?: boolean;
};

export type ToolHandler = (
  args: unknown,
  context: ToolExecutionContext
) => Promise<ToolResultEnvelope>;
