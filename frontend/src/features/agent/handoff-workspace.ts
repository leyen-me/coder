import { ApiError, apiPost } from "@/lib/api/client";
import type {
  MessageProcessStep,
  MessageRecord,
  MessageToolInvocation,
  SessionRecord,
} from "@/lib/db";
import type { FileModifyData, ReadFileData } from "./tools/types";

const ARCHIVE_KEEP_RECENT_TOOL_RESULTS = 4;
const LONG_OUTPUT_THRESHOLD_CHARS = 4_000;

export type ToolArchiveIndexEntry = {
  sessionId: string;
  messageId: string;
  invocationId: string;
  toolName: string;
  createdAt: number;
  archivePath: string;
  outputPath: string | null;
  relativeTargetPath: string | null;
  queryPattern: string | null;
};

export type ToolArchiveIndex = {
  sessionId: string;
  generatedAt: string;
  entries: ToolArchiveIndexEntry[];
};

export type SessionChainHop = {
  hop: number;
  sourceSessionId: string;
  continuedSessionId: string;
  generatedAt: string;
  summary: string;
  workingSet: string[];
  invariants: string[];
  assumptions: string[];
  openRisks: string[];
};

export type SessionChainManifest = {
  rootSessionId: string;
  hops: SessionChainHop[];
  cumulativeWorkingSet: string[];
  invariants: string[];
  assumptions: string[];
};

export type PreparedReplayArtifacts = {
  historyFilePath: string | null;
  toolArchiveIndexPath: string | null;
};

export type PreparedReplayRecords = {
  messages: MessageRecord[];
  artifacts: PreparedReplayArtifacts;
};

type HandoffWorkingSetLike = {
  path: string;
  lastKnownHash?: string | null;
  needsVerification?: boolean;
};

type WorkspaceReadResult = {
  path: string;
  sha256: string;
  content: string;
};

export function buildToolArchiveIndexPath(sessionId: string): string {
  return `.agent/sessions/${sessionId}/tool-archive/index.json`;
}

export function buildToolArchiveFilePath(
  sessionId: string,
  messageId: string,
  invocation: Pick<MessageToolInvocation, "id" | "name">
): string {
  return [
    ".agent/sessions",
    sessionId,
    "tool-archive",
    `${sanitizePathSegment(invocation.name)}__${sanitizePathSegment(messageId)}__${sanitizePathSegment(invocation.id)}.json`,
  ].join("/");
}

export function buildToolOutputFilePath(
  sessionId: string,
  messageId: string,
  invocation: Pick<MessageToolInvocation, "id" | "name">
): string {
  return [
    ".agent/sessions",
    sessionId,
    "outputs",
    `${sanitizePathSegment(invocation.name)}__${sanitizePathSegment(messageId)}__${sanitizePathSegment(invocation.id)}.json`,
  ].join("/");
}

export function buildSessionHistoryPath(sessionId: string): string {
  return `.agent/sessions/${sessionId}/history.md`;
}

export function buildChainManifestPath(rootSessionId: string): string {
  return `.agent/chains/${rootSessionId}/manifest.json`;
}

export async function prepareReplayRecords(input: {
  workspaceDir: string | null;
  sessionId: string;
  messages: MessageRecord[];
}): Promise<PreparedReplayRecords> {
  const trimmedWorkspace = input.workspaceDir?.trim() || null;
  if (!trimmedWorkspace) {
    return {
      messages: cloneMessageRecords(input.messages),
      artifacts: {
        historyFilePath: null,
        toolArchiveIndexPath: null,
      },
    };
  }

  const archiveEntries = await writeToolArchives(
    trimmedWorkspace,
    input.sessionId,
    input.messages
  );
  await writeSessionHistory(trimmedWorkspace, input.sessionId, input.messages);

  const archivedByInvocationId = new Map(
    archiveEntries.map((entry) => [entry.invocationId, entry] as const)
  );
  const compactedMessages = compactReplayMessages(
    input.messages,
    archivedByInvocationId
  );

  return {
    messages: compactedMessages,
    artifacts: {
      historyFilePath: buildSessionHistoryPath(input.sessionId),
      toolArchiveIndexPath: buildToolArchiveIndexPath(input.sessionId),
    },
  };
}

export async function upsertSessionChainManifest(input: {
  workspaceDir: string | null;
  rootSessionId: string;
  sourceSessionId: string;
  continuedSessionId: string;
  generatedAt: string;
  summary: string;
  workingSet: string[];
  invariants: string[];
  assumptions: string[];
  openRisks: string[];
}): Promise<string | null> {
  const workspaceDir = input.workspaceDir?.trim() || null;
  if (!workspaceDir) {
    return null;
  }

  const path = buildChainManifestPath(input.rootSessionId);
  const existing = await readWorkspaceTextFile(workspaceDir, path);
  const manifest = parseChainManifest(existing?.content, input.rootSessionId);
  const hop: SessionChainHop = {
    hop: manifest.hops.length + 1,
    sourceSessionId: input.sourceSessionId,
    continuedSessionId: input.continuedSessionId,
    generatedAt: input.generatedAt,
    summary: input.summary.trim(),
    workingSet: uniqueStrings(input.workingSet),
    invariants: uniqueStrings(input.invariants),
    assumptions: uniqueStrings(input.assumptions),
    openRisks: uniqueStrings(input.openRisks),
  };

  const next: SessionChainManifest = {
    rootSessionId: input.rootSessionId,
    hops: [...manifest.hops, hop],
    cumulativeWorkingSet: uniqueStrings([
      ...manifest.cumulativeWorkingSet,
      ...hop.workingSet,
    ]),
    invariants: uniqueStrings([...manifest.invariants, ...hop.invariants]),
    assumptions: uniqueStrings([...manifest.assumptions, ...hop.assumptions]),
  };

  await upsertWorkspaceTextFile(workspaceDir, path, `${JSON.stringify(next, null, 2)}\n`);
  return path;
}

export async function markWorkingSetVerificationStatus(
  workspaceDir: string | null,
  workingSet: HandoffWorkingSetLike[]
): Promise<HandoffWorkingSetLike[]> {
  const trimmedWorkspace = workspaceDir?.trim() || null;
  if (!trimmedWorkspace) {
    return workingSet.map((entry) => ({ ...entry }));
  }

  const results: HandoffWorkingSetLike[] = [];
  for (const entry of workingSet) {
    if (!entry.lastKnownHash || entry.path.startsWith("[")) {
      results.push({ ...entry });
      continue;
    }

    const current = await readWorkspaceTextFile(trimmedWorkspace, entry.path);
    results.push({
      ...entry,
      needsVerification:
        current === null ? true : current.sha256.trim() !== entry.lastKnownHash.trim(),
    });
  }

  return results;
}

export async function readToolArchiveIndex(
  workspaceDir: string,
  sessionId: string
): Promise<ToolArchiveIndex | null> {
  const result = await readWorkspaceTextFile(
    workspaceDir,
    buildToolArchiveIndexPath(sessionId)
  );
  if (!result) {
    return null;
  }

  try {
    return JSON.parse(result.content) as ToolArchiveIndex;
  } catch {
    return null;
  }
}

export async function readWorkspaceTextFile(
  workspaceDir: string,
  path: string
): Promise<WorkspaceReadResult | null> {
  try {
    let startLine = 1;
    let sha256 = "";
    let content = "";
    let resolvedPath = path;

    while (true) {
      const result = await apiPost<ReadFileData>("/api/read_file", {
        workspaceDir,
        path,
        startLine,
        maxLines: 1000,
        respectGitignore: false,
        numbered: false,
      });
      resolvedPath = result.path;
      sha256 = result.sha256;
      content += result.content;
      if (!result.truncated || result.endLine >= result.totalLines) {
        break;
      }
      content += "\n";
      startLine = result.endLine + 1;
    }

    return {
      path: resolvedPath,
      sha256,
      content,
    };
  } catch (error) {
    if (error instanceof ApiError && error.code === "path_not_found") {
      return null;
    }
    throw error;
  }
}

export async function upsertWorkspaceTextFile(
  workspaceDir: string,
  path: string,
  content: string
): Promise<void> {
  try {
    await apiPost<FileModifyData>("/api/replace_file", {
      workspaceDir,
      path,
      content,
      createBackup: false,
      respectGitignore: false,
    });
    return;
  } catch (error) {
    if (!(error instanceof ApiError) || error.code !== "path_not_found") {
      throw error;
    }
  }

  await apiPost("/api/create_file", {
    workspaceDir,
    path,
    content,
    createParentDirs: true,
  });
}

export async function resolveHandoffRootSessionId(
  session: SessionRecord,
  getSessionById: (sessionId: string) => Promise<SessionRecord | null>
): Promise<string> {
  let current: SessionRecord | null = session;
  let rootSessionId = session.id;

  while (current?.handoffFromSessionId) {
    rootSessionId = current.handoffFromSessionId;
    current = await getSessionById(current.handoffFromSessionId);
  }

  return rootSessionId;
}

function compactReplayMessages(
  messages: MessageRecord[],
  archivedByInvocationId: ReadonlyMap<string, ToolArchiveIndexEntry>
): MessageRecord[] {
  const completedInvocations = messages.flatMap((message) =>
    (message.toolInvocations ?? []).filter((invocation) => invocation.output !== undefined)
  );
  const keepInvocationIds = new Set(
    completedInvocations
      .slice(-ARCHIVE_KEEP_RECENT_TOOL_RESULTS)
      .map((invocation) => invocation.id)
  );

  return messages.map((message) => ({
    ...message,
    toolInvocations: (message.toolInvocations ?? []).map((invocation) => {
      if (
        invocation.output === undefined ||
        keepInvocationIds.has(invocation.id)
      ) {
        return cloneInvocation(invocation);
      }

      const archive = archivedByInvocationId.get(invocation.id);
      if (!archive) {
        return cloneInvocation(invocation);
      }

      return {
        ...cloneInvocation(invocation),
        output: {
          ok: true,
          tool: invocation.name,
          data: {
            archived: true,
            archivePath: archive.archivePath,
            outputPath: archive.outputPath,
            summary: summarizeInvocation(invocation),
          },
        },
      };
    }),
    processSteps: cloneProcessSteps(message.processSteps),
  }));
}

async function writeToolArchives(
  workspaceDir: string,
  sessionId: string,
  messages: MessageRecord[]
): Promise<ToolArchiveIndexEntry[]> {
  const entries: ToolArchiveIndexEntry[] = [];

  for (const message of messages) {
    for (const invocation of message.toolInvocations ?? []) {
      const archivePath = buildToolArchiveFilePath(sessionId, message.id, invocation);
      const serializedOutput = serializeInvocationOutput(invocation);
      let outputPath: string | null = null;

      if (serializedOutput.length > LONG_OUTPUT_THRESHOLD_CHARS) {
        outputPath = buildToolOutputFilePath(sessionId, message.id, invocation);
        await upsertWorkspaceTextFile(workspaceDir, outputPath, `${serializedOutput}\n`);
      }

      const entry: ToolArchiveIndexEntry = {
        sessionId,
        messageId: message.id,
        invocationId: invocation.id,
        toolName: invocation.name,
        createdAt: message.createdAt,
        archivePath,
        outputPath,
        relativeTargetPath: extractRelativeTargetPath(invocation.input),
        queryPattern: extractQueryPattern(invocation.input),
      };

      await upsertWorkspaceTextFile(
        workspaceDir,
        archivePath,
        `${JSON.stringify(
          {
            ...entry,
            input: invocation.input ?? {},
            output:
              outputPath === null
                ? invocation.output ??
                  (invocation.errorText
                    ? {
                        ok: false,
                        tool: invocation.name,
                        error: {
                          code: "tool_error",
                          message: invocation.errorText,
                        },
                      }
                    : null)
                : undefined,
            summary: summarizeInvocation(invocation),
          },
          null,
          2
        )}\n`
      );

      entries.push(entry);
    }
  }

  const index: ToolArchiveIndex = {
    sessionId,
    generatedAt: new Date().toISOString(),
    entries,
  };
  await upsertWorkspaceTextFile(
    workspaceDir,
    buildToolArchiveIndexPath(sessionId),
    `${JSON.stringify(index, null, 2)}\n`
  );

  return entries;
}

async function writeSessionHistory(
  workspaceDir: string,
  sessionId: string,
  messages: MessageRecord[]
): Promise<void> {
  const lines: string[] = [
    "# Session History Export",
    "",
    `- sessionId: ${sessionId}`,
    `- generatedAt: ${new Date().toISOString()}`,
    "",
  ];

  messages.forEach((message, index) => {
    lines.push(`## Message ${index + 1}`);
    lines.push(`- id: ${message.id}`);
    lines.push(`- role: ${message.role}`);
    lines.push(`- status: ${message.status}`);
    lines.push(`- createdAt: ${new Date(message.createdAt).toISOString()}`);
    if (message.messageKind) {
      lines.push(`- messageKind: ${message.messageKind}`);
    }
    if (message.referencedSkills?.length) {
      lines.push(`- referencedSkills: ${message.referencedSkills.join(", ")}`);
    }
    if (message.toolInvocations.length > 0) {
      lines.push(
        `- tools: ${message.toolInvocations.map((invocation) => invocation.name).join(", ")}`
      );
    }
    lines.push("");
    lines.push("```text");
    lines.push(message.content || "");
    lines.push("```");
    lines.push("");
  });

  await upsertWorkspaceTextFile(
    workspaceDir,
    buildSessionHistoryPath(sessionId),
    `${lines.join("\n").trimEnd()}\n`
  );
}

function parseChainManifest(
  raw: string | undefined,
  rootSessionId: string
): SessionChainManifest {
  if (raw?.trim()) {
    try {
      const parsed = JSON.parse(raw) as Partial<SessionChainManifest>;
      return {
        rootSessionId:
          typeof parsed.rootSessionId === "string" && parsed.rootSessionId.trim()
            ? parsed.rootSessionId
            : rootSessionId,
        hops: Array.isArray(parsed.hops) ? parsed.hops.filter(Boolean) as SessionChainHop[] : [],
        cumulativeWorkingSet: Array.isArray(parsed.cumulativeWorkingSet)
          ? parsed.cumulativeWorkingSet.filter(isNonEmptyString)
          : [],
        invariants: Array.isArray(parsed.invariants)
          ? parsed.invariants.filter(isNonEmptyString)
          : [],
        assumptions: Array.isArray(parsed.assumptions)
          ? parsed.assumptions.filter(isNonEmptyString)
          : [],
      };
    } catch {
      // fall through
    }
  }

  return {
    rootSessionId,
    hops: [],
    cumulativeWorkingSet: [],
    invariants: [],
    assumptions: [],
  };
}

function serializeInvocationOutput(invocation: MessageToolInvocation): string {
  if (invocation.output !== undefined) {
    return JSON.stringify(invocation.output, null, 2);
  }
  if (invocation.errorText?.trim()) {
    return JSON.stringify(
      {
        ok: false,
        tool: invocation.name,
        error: {
          code: "tool_error",
          message: invocation.errorText,
        },
      },
      null,
      2
    );
  }
  return JSON.stringify(
    {
      ok: false,
      tool: invocation.name,
      error: {
        code: "missing_output",
        message: "Tool result was not persisted.",
      },
    },
    null,
    2
  );
}

function summarizeInvocation(invocation: MessageToolInvocation): string {
  const target = extractRelativeTargetPath(invocation.input);
  const query = extractQueryPattern(invocation.input);
  if (target) {
    return `${invocation.name} ${target}`;
  }
  if (query) {
    return `${invocation.name} ${query}`;
  }
  return invocation.name;
}

function extractRelativeTargetPath(input: unknown): string | null {
  if (typeof input !== "object" || input === null) {
    return null;
  }
  const record = input as Record<string, unknown>;
  const candidate =
    record.path ??
    record.target_directory ??
    record.working_directory ??
    record.absolute_path;
  return typeof candidate === "string" && candidate.trim()
    ? candidate.trim()
    : null;
}

function extractQueryPattern(input: unknown): string | null {
  if (typeof input !== "object" || input === null) {
    return null;
  }
  const record = input as Record<string, unknown>;
  const candidate = record.pattern ?? record.glob_pattern ?? record.command;
  return typeof candidate === "string" && candidate.trim()
    ? candidate.trim()
    : null;
}

function cloneMessageRecords(messages: MessageRecord[]): MessageRecord[] {
  return messages.map((message) => ({
    ...message,
    referencedSkills: message.referencedSkills ? [...message.referencedSkills] : undefined,
    processSteps: cloneProcessSteps(message.processSteps),
    toolInvocations: (message.toolInvocations ?? []).map(cloneInvocation),
  }));
}

function cloneProcessSteps(
  steps: MessageProcessStep[] | undefined
): MessageProcessStep[] | undefined {
  return steps?.map((step) => ({ ...step }));
}

function cloneInvocation(invocation: MessageToolInvocation): MessageToolInvocation {
  return {
    ...invocation,
    input: invocation.input,
    output: invocation.output,
  };
}

function sanitizePathSegment(value: string): string {
  return value.trim().replace(/[^a-zA-Z0-9._-]+/g, "_") || "unknown";
}

function isNonEmptyString(value: unknown): value is string {
  return typeof value === "string" && value.trim().length > 0;
}

function uniqueStrings(values: readonly string[]): string[] {
  const seen = new Set<string>();
  const result: string[] = [];
  for (const value of values) {
    const trimmed = value.trim();
    if (!trimmed || seen.has(trimmed)) {
      continue;
    }
    seen.add(trimmed);
    result.push(trimmed);
  }
  return result;
}
