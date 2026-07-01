/**
 * Tool handler types for the Coder CLI.
 */

import type { AgentMode } from "../agent/types";

export type ToolResultEnvelope = {
  ok: boolean;
  tool: string;
  data?: unknown;
  error?: {
    code: string;
    message: string;
  };
};

export type ToolExecutionContext = {
  workspaceDir: string | null;
  sessionId?: string;
  taskId?: string;
  signal?: AbortSignal;
  agentMode?: AgentMode;
};

export type ToolHandler = (
  args: unknown,
  context: ToolExecutionContext,
) => Promise<ToolResultEnvelope>;

export type ShellStatus =
  | "running"
  | "completed"
  | "failed"
  | "timeout"
  | "cancelled";

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
  stdout: string;
  stderr: string;
  stdoutTruncated: boolean;
  stderrTruncated: boolean;
};

export type ListDirEntry = {
  name: string;
  path: string;
  isDir: boolean;
  size?: number;
};

export type ReadFileData = {
  path: string;
  content: string;
  totalLines: number;
  startLine: number;
  endLine: number;
  truncated: boolean;
};

export type WriteFileData = {
  path: string;
  action: "created";
  bytesWritten: number;
  linesAdded: number;
  linesRemoved: number;
};

export type FileModifyData = {
  path: string;
  action: "replaced" | "modified";
  bytesWritten: number;
  linesAdded: number;
  linesRemoved: number;
};

export type GlobData = {
  pattern: string;
  targetDirectory: string;
  matches: string[];
  totalMatches: number;
  truncated: boolean;
};

export type GrepData = {
  pattern: string;
  path: string;
  outputMode: string;
  matches?: Array<{
    path: string;
    lineNumber: number;
    line: string;
    contextBefore?: string[];
    contextAfter?: string[];
  }>;
  files?: string[];
  totalMatches: number;
  truncated: boolean;
  skippedFiles?: number;
};

export type WorkspaceTreeData = {
  treeText: string;
  totalLines: number;
  startLine: number;
  endLine: number;
  truncated: boolean;
};

export type WebSearchData = {
  query: string;
  results: Array<{
    title: string;
    url: string;
    snippet: string;
    score?: number;
  }>;
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

export { toolSuccess, toolFailure } from "./result";
