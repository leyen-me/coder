import { readFiles } from "@/lib/workspace-file-api";

export interface CompactConfig {
  /** Maximum total token budget for the replay messages. */
  maxTokens: number;
  /** Minimum tokens to reserve for new conversation. */
  reservedTokens: number;
  /** Maximum number of tool invocations to keep per message. */
  maxToolInvocationsPerMessage?: number;
}

export interface CompactReplayResult {
  messages: Array<{
    role: "user" | "assistant";
    content: string;
    thinking?: string;
    toolInvocations?: any[];
  }>;
  totalTokens: number;
  droppedCount: number;
}

/**
 * Compact replay messages by trimming content and limiting tool invocations.
 * This is the core function for session compaction during context overflow.
 */
export async function compactReplayMessages(
  messages: Array<{
    id: string;
    sessionId: string;
    role: "user" | "assistant";
    content: string;
    thinking: string;
    toolInvocations?: any[];
    status: string;
    createdAt: number;
  }>,
  config: CompactConfig,
): Promise<CompactReplayResult> {
  const { maxTokens, reservedTokens, maxToolInvocationsPerMessage = 50 } = config;
  const effectiveBudget = maxTokens - reservedTokens;

  interface ReplayMessage {
    role: "user" | "assistant";
    content: string;
    thinking?: string;
    toolInvocations?: any[];
  }

  async function compactContent(text: string, targetLength: number): Promise<string> {
    if (!text || text.length <= targetLength) return text;

    try {
      const files = await readFiles([".agent/workspace-files.json"]);
      const workspaceFileCount = files[".agent/workspace-files.json"]?.length ?? 0;

      const compacted = [
        `// COMPACTED: Original message trimmed for context budget`,
        `// Context: ${workspaceFileCount} workspace files tracked`,
        `---`,
        text.slice(0, Math.floor(targetLength * 0.4)),
        `\n\n[Content compacted: ${text.length - targetLength} characters removed]`,
        `\n\n${text.slice(-Math.floor(targetLength * 0.6))}`,
      ].join("\n");

      return compacted;
    } catch {
      const fallback = [
        `// COMPACTED: Original message trimmed for context budget`,
        `---`,
        text.slice(0, Math.floor(targetLength * 0.4)),
        `\n\n[Content compacted: ${text.length - targetLength} characters removed]`,
        `\n\n${text.slice(-Math.floor(targetLength * 0.6))}`,
      ].join("\n");

      return fallback;
    }
  }

  function estimateTokens(text: string): number {
    return Math.ceil(text.length / 4);
  }

  const replayMessages: ReplayMessage[] = [];
  let totalTokens = 0;
  let droppedCount = 0;

  for (const msg of messages) {
    if (msg.status === "compacted") continue;

    const contentLength = Math.max(200, Math.min(1500, effectiveBudget / messages.length));

    const compactedContent = await compactContent(msg.content, contentLength);
    const compactedThinking = msg.role === "assistant" && msg.thinking
      ? await compactContent(msg.thinking, Math.floor(contentLength * 0.5))
      : undefined;

    let toolInvocations = msg.toolInvocations;
    if (toolInvocations && toolInvocations.length > maxToolInvocationsPerMessage) {
      const recent = toolInvocations.slice(-maxToolInvocationsPerMessage);
      droppedCount += toolInvocations.length - maxToolInvocationsPerMessage;

      toolInvocations = [
        {
          id: "__compact_summary__",
          name: "compact_info",
          input: {},
          output: {
            ok: true,
            tool: "compact_info",
            data: {
              message: `Previous ${toolInvocations.length - maxToolInvocationsPerMessage} tool invocations compacted for context budget`,
              totalOriginal: toolInvocations.length,
              retained: maxToolInvocationsPerMessage,
            },
          },
          state: "output-available",
        },
        ...recent,
      ];
    }

    const msgTokens = estimateTokens(compactedContent) + (compactedThinking ? estimateTokens(compactedThinking) : 0);

    if (totalTokens + msgTokens > effectiveBudget && replayMessages.length > 0) {
      droppedCount++;
      continue;
    }

    totalTokens += msgTokens;
    replayMessages.push({
      role: msg.role,
      content: compactedContent,
      thinking: compactedThinking,
      toolInvocations,
    });
  }

  return {
    messages: replayMessages,
    totalTokens,
    droppedCount,
  };
}
