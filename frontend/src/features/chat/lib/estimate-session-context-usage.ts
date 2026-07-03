import type { LanguageModelUsage } from "ai";

import { serializeInvocationToolContent } from "@/features/agent/process-steps";
import type { MessageRecord } from "@/lib/db";
import {
  DEFAULT_MODEL_CONTEXT_WINDOW,
  findModelDefinition,
  type ModelDefinition,
} from "@/lib/model-provider/model-definition";

const IMAGE_TOKEN_ESTIMATE = 765;
const CJK_PATTERN = /[\u4e00-\u9fff\u3400-\u4dbf\uf900-\ufaff]/g;

export type SessionContextUsage = {
  usedTokens: number;
  maxTokens: number;
  usage: LanguageModelUsage;
  modelId: string;
};

export function estimateTextTokens(text: string): number {
  if (!text) {
    return 0;
  }

  const cjkMatches = text.match(CJK_PATTERN);
  const cjkCount = cjkMatches?.length ?? 0;
  const nonCjkCount = text.length - cjkCount;

  return Math.ceil(cjkCount + nonCjkCount / 4);
}

function createUsage(breakdown: {
  inputTokens: number;
  outputTokens: number;
  reasoningTokens: number;
}): LanguageModelUsage {
  const totalTokens =
    breakdown.inputTokens + breakdown.outputTokens + breakdown.reasoningTokens;

  return {
    inputTokens: breakdown.inputTokens,
    outputTokens: breakdown.outputTokens,
    reasoningTokens: breakdown.reasoningTokens,
    cachedInputTokens: 0,
    totalTokens,
    inputTokenDetails: {
      noCacheTokens: breakdown.inputTokens,
      cacheReadTokens: 0,
      cacheWriteTokens: 0,
    },
    outputTokenDetails: {
      textTokens: breakdown.outputTokens,
      reasoningTokens: breakdown.reasoningTokens,
    },
  };
}

function estimateMessageUsage(message: MessageRecord): {
  inputTokens: number;
  outputTokens: number;
  reasoningTokens: number;
} {
  // When the provider returned actual token usage, use it directly.
  if (message.usage && message.role === "assistant") {
    return {
      inputTokens: 0,
      outputTokens: message.usage.completionTokens,
      reasoningTokens: 0,
    };
  }

  let inputTokens = 0;
  let outputTokens = 0;
  let reasoningTokens = 0;

  if (message.role === "user") {
    inputTokens += estimateTextTokens(message.content);
    inputTokens += (message.images?.length ?? 0) * IMAGE_TOKEN_ESTIMATE;
    return { inputTokens, outputTokens, reasoningTokens };
  }

  outputTokens += estimateTextTokens(message.content);
  reasoningTokens += estimateTextTokens(message.thinking);

  const processSteps = message.processSteps ?? [];
  if (processSteps.length > 0) {
    outputTokens = 0;
    reasoningTokens = 0;

    for (const step of processSteps) {
      if (step.kind === "reasoning") {
        reasoningTokens += estimateTextTokens(step.text);
      } else if (step.kind === "answer") {
        outputTokens += estimateTextTokens(step.text);
      }
    }
  }

  for (const invocation of message.toolInvocations) {
    inputTokens += estimateTextTokens(JSON.stringify(invocation.input ?? {}));
    inputTokens += estimateTextTokens(
      serializeInvocationToolContent(invocation)
    );
  }

  return { inputTokens, outputTokens, reasoningTokens };
}

function resolveEffectiveMessages(
  messages: readonly MessageRecord[],
  editingMessageId?: string | null
): MessageRecord[] {
  if (!editingMessageId) {
    return [...messages];
  }

  const editIndex = messages.findIndex(
    (message) => message.id === editingMessageId
  );
  if (editIndex === -1) {
    return [...messages];
  }

  return messages.slice(0, editIndex + 1);
}

export function estimateSessionContextUsage(input: {
  messages: readonly MessageRecord[];
  systemPrompt?: string | null;
  modelId: string;
  models: readonly ModelDefinition[];
  editingMessageId?: string | null;
}): SessionContextUsage | null {
  const effectiveMessages = resolveEffectiveMessages(
    input.messages,
    input.editingMessageId
  );

  if (effectiveMessages.length === 0) {
    return null;
  }

  const breakdown = effectiveMessages.reduce(
    (totals, message) => {
      const usage = estimateMessageUsage(message);
      return {
        inputTokens: totals.inputTokens + usage.inputTokens,
        outputTokens: totals.outputTokens + usage.outputTokens,
        reasoningTokens: totals.reasoningTokens + usage.reasoningTokens,
      };
    },
    { inputTokens: 0, outputTokens: 0, reasoningTokens: 0 }
  );

  const systemPrompt = input.systemPrompt?.trim() ?? "";
  breakdown.inputTokens += estimateTextTokens(systemPrompt);

  const usedTokens =
    breakdown.inputTokens + breakdown.outputTokens + breakdown.reasoningTokens;
  const selectedModel = findModelDefinition(input.models, input.modelId);
  const maxTokens = selectedModel?.contextWindow ?? DEFAULT_MODEL_CONTEXT_WINDOW;

  return {
    modelId: input.modelId,
    maxTokens,
    usedTokens,
    usage: createUsage(breakdown),
  };
}
