import type { LanguageModelUsage } from "ai";

import type { MessageRecord, SessionRecord } from "@/lib/db";
import type { ModelDefinition } from "@/lib/model-provider/model-definition";
import { parseModelValue } from "@/lib/model-provider/resolve-provider-config";

const CJK_PATTERN = /[\u4e00-\u9fff\u3400-\u4dbf\uf900-\ufaff]/g;

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

/**
 * 与后端 `model_history_from_latest_compact` 一致：
 * 最新 handoff + 其后的全部消息（旧 handoff 被跳过）。
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

  const result: MessageRecord[] = [compactMessage];
  for (let index = compactIndex + 1; index < messages.length; index += 1) {
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
