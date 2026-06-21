import type { ModelDefinition } from "@/lib/model-provider/types";

import type { AgentMode } from "../types";
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
  oldContent?: string;
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
  oldContent?: string;
  /** The actual content written to disk (after line-ending normalization). */
  newContent?: string;
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

export type ReadShellLogsData = {
  shellId: string;
  stream: string;
  data: string;
  offset: number;
  totalBytes: number;
  truncated: boolean;
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

export type WorkspaceTreeData = {
  treeText: string;
  totalLines: number;
  startLine: number;
  endLine: number;
  truncated: boolean;
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
  /** Agent mode used to enforce tool permission at execution time. */
  agentMode?: AgentMode;
  /**
   * Tool names explicitly provided in this session's tool list.
   * When set, these tools bypass the agent-mode exclusion check,
   * allowing callers (e.g. automations) to dynamically grant
   * tools that are normally restricted in agent mode.
   */
  explicitlyAllowedToolNames?: ReadonlySet<string>;
  /**
   * Provider config for spawning sub-agent instances.
   * When present, the spawn_subagent tool can run a child agent
   * using the same provider/model configuration as the parent.
   */
  spawnSubAgentConfig?: {
    baseUrl: string;
    apiKey: string;
    apiKeySource: "manual" | "env";
    apiKeyEnvVar: string;
    model: string;
    models: readonly ModelDefinition[];
    thinkingEnabled?: boolean;
  };
};

/** Input arguments for spawn_subagent tool. */
export type SubAgentInput = {
  task: string;
  context?: string;
  tools?: string[];
};

/** A single step recorded by the sub-agent. */
export type SubAgentStep = {
  kind: "reasoning" | "tool";
  text: string;
  toolName?: string;
  toolLabel?: string;
  state?: "pending" | "running" | "completed" | "error";
};

/** Structured output returned by spawn_subagent. */
export type SubAgentOutput = {
  task: string;
  steps: SubAgentStep[];
  summary: string;
  rounds: number;
  toolCalls: number;
  tokensUsed?: number;
  error?: string;
};

export type ToolHandler = (
  args: unknown,
  context: ToolExecutionContext
) => Promise<ToolResultEnvelope>;
