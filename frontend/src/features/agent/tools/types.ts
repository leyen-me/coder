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
  content: string;
};

export type ReadFileToolErrorPayload = {
  code: string;
  message: string;
  mimeType?: string;
  size?: number;
};

export type PriorToolOutputData = {
  sessionId: string;
  toolName?: string;
  archivePath: string;
  outputPath?: string | null;
  content: string;
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

/**
 * Data returned from a remote shell execution.
 * The Rust backend returns ShellOutput which has the same shape as ShellData.
 */
export type RemoteShellData = ShellData;

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

export type WebSearchConfig = {
  provider: "tavily" | "searxng";
  tavilyApiKeySource: "manual" | "env";
  tavilyApiKey: string;
  tavilyApiKeyEnvVar: string;
  searxngBaseUrl: string;
};

/** @deprecated Use WebSearchConfig */
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
  order?: number;
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
  webSearchConfig?: WebSearchConfig | null;
  webSearchConfigError?: string;
  allowPrivateNetworkAccess?: boolean;
  /** Agent mode used to enforce tool permission at execution time. */
  agentMode?: AgentMode;
  /**
   * Tool names explicitly provided in this session's tool list.
   * When set, these tools bypass the agent-mode exclusion check,
   * allowing callers to dynamically grant
   * tools that are normally restricted in agent mode.
   */
  explicitlyAllowedToolNames?: ReadonlySet<string>;
  /**
   * Callback for tools to emit partial/progressive output during execution.
   * The UI updates in real-time as partial data is pushed.
   */
  emitProgress?: (partialOutput: unknown) => void;
};

/** Input arguments for spawn_subagent tool. */
export type SubAgentInput = {
  task: string;
  context?: string;
  tools?: string[];
};

/** A single step recorded by the sub-agent. */
export type SubAgentStep = {
  kind: "reasoning" | "tool" | "compact";
  text: string;
  toolName?: string;
  toolLabel?: string;
  state?: "pending" | "running" | "completed" | "error";
  /** Compact summary preview (compact steps only). */
  preview?: string;
  /** Messages compacted out of model context (compact steps only). */
  removedCount?: number;
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
  /** The final text content produced by the sub-agent. */
  content?: string;
};

export type ToolHandler = (
  args: unknown,
  context: ToolExecutionContext
) => Promise<ToolResultEnvelope>;
