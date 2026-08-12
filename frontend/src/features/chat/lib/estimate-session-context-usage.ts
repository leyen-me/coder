import type { LanguageModelUsage } from "ai";

import type { MessageRecord, SessionRecord } from "@/lib/db";
import type { ModelDefinition } from "@/lib/model-provider/model-definition";
import { parseModelValue } from "@/lib/model-provider/resolve-provider-config";

const CJK_PATTERN = /[\u4e00-\u9fff\u3400-\u4dbf\uf900-\ufaff]/g;
/** 与后端 `COMPACT_TAIL_MAX_CHARS` 一致：旧 marker 缺起点时按字符预算恢复。 */
const COMPACT_TAIL_MAX_CHARS = 40_000;

export type SessionContextUsage = {
  usedTokens: number;
  maxTokens: number;
  usage: LanguageModelUsage;
  modelId: string;
};

/** 纯展示用的字符→token 近似，仍给 agent 诊断面板使用。 */
export function estimateTextTokens(text: string): number {
  if (!text) {
    return 0;
  }

  const cjkMatches = text.match(CJK_PATTERN);
  const cjkCount = cjkMatches?.length ?? 0;
  const nonCjkCount = text.length - cjkCount;

  return Math.ceil(cjkCount + nonCjkCount / 4);
}

function createUsage(inputTokens: number): LanguageModelUsage {
  return {
    inputTokens,
    outputTokens: 0,
    reasoningTokens: 0,
    cachedInputTokens: 0,
    totalTokens: inputTokens,
    inputTokenDetails: {
      noCacheTokens: inputTokens,
      cacheReadTokens: 0,
      cacheWriteTokens: 0,
    },
    outputTokenDetails: {
      textTokens: 0,
      reasoningTokens: 0,
    },
  };
}

function recordChars(record: MessageRecord): number {
  const toolsChars = (record.toolInvocations ?? []).reduce(
    (total, invocation) =>
      total +
      JSON.stringify(invocation.input ?? {}).length +
      JSON.stringify(invocation.output ?? null).length,
    0
  );
  const stepsChars = (record.processSteps ?? []).reduce((total, step) => {
    if (step.kind === "reasoning" || step.kind === "answer") {
      return total + step.text.length;
    }
    return total;
  }, 0);
  return (
    record.content.length +
    record.thinking.length +
    toolsChars +
    stepsChars
  );
}

/**
 * 旧 compact 记录缺少 first_kept 时，按后端同样的字符预算恢复起点。
 */
function recoverFirstKeptStartIndex(
  messages: readonly MessageRecord[],
  compactIndex: number
): number {
  const compactCreatedAt = messages[compactIndex]?.createdAt ?? 0;
  const conversation: Array<{ index: number; message: MessageRecord }> = [];

  for (let index = 0; index < compactIndex; index += 1) {
    const message = messages[index];
    if (!message || message.messageKind === "compact") {
      continue;
    }
    if (message.createdAt > compactCreatedAt) {
      continue;
    }
    conversation.push({ index, message });
  }

  if (conversation.length === 0) {
    return Math.min(compactIndex + 1, messages.length);
  }

  let selected = 0;
  let remaining = COMPACT_TAIL_MAX_CHARS;
  for (let i = conversation.length - 1; i >= 0; i -= 1) {
    const entry = conversation[i];
    if (!entry) {
      continue;
    }
    const chars = recordChars(entry.message);
    if (selected > 0 && chars > remaining) {
      break;
    }
    selected += 1;
    remaining -= chars;
  }

  if (selected === 0) {
    selected = 1;
  }

  return conversation[conversation.length - selected]?.index ?? 0;
}

/**
 * 与后端 `model_history_from_latest_compact` 一致：
 * 最新压缩记录 + 从 first_kept 到最新消息。
 */
export function modelHistoryFromLatestCompact(
  messages: readonly MessageRecord[]
): MessageRecord[] {
  let compactIndex = -1;
  for (let index = messages.length - 1; index >= 0; index -= 1) {
    if (messages[index]?.messageKind === "compact") {
      compactIndex = index;
      break;
    }
  }

  if (compactIndex === -1) {
    return [...messages];
  }

  const compactMessage = messages[compactIndex];
  if (!compactMessage) {
    return [...messages];
  }

  const firstKeptId = compactMessage.taskId;
  let startIndex =
    firstKeptId == null
      ? -1
      : messages.findIndex(
          (message) =>
            message.id === firstKeptId && message.messageKind !== "compact"
        );

  if (startIndex === -1) {
    startIndex = recoverFirstKeptStartIndex(messages, compactIndex);
  }

  const result: MessageRecord[] = [compactMessage];
  for (let index = startIndex; index < messages.length; index += 1) {
    const message = messages[index];
    if (!message || message.messageKind === "compact") {
      continue;
    }
    result.push(message);
  }
  return result;
}

/**
 * Composer 只读后端真实 usage 快照，前端不再自行估算。
 *
 * 没有可用快照时返回 null，等待后端写入真实 usage 后再显示。
 */
export function estimateSessionContextUsage(input: {
  messages?: readonly MessageRecord[];
  systemPrompt?: string | null;
  modelId: string;
  models?: readonly ModelDefinition[];
  editingMessageId?: string | null;
  contextUsageSnapshot?: SessionRecord["contextUsageSnapshot"] | null;
}): SessionContextUsage | null {
  const snapshot = input.contextUsageSnapshot;
  if (
    !snapshot ||
    snapshot.usedTokens <= 0 ||
    snapshot.maxTokens <= 0
  ) {
    return null;
  }

  const modelId = parseModelValue(input.modelId).modelId;
  return {
    modelId,
    maxTokens: snapshot.maxTokens,
    usedTokens: snapshot.usedTokens,
    usage: createUsage(snapshot.usedTokens),
  };
}
