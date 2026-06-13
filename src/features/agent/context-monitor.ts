import { estimateTextTokens } from "@/features/chat/lib/estimate-session-context-usage";
import { DEFAULT_MODEL_CONTEXT_WINDOW } from "@/lib/model-provider/model-definition";
import {
  DEFAULT_AGENT_HANDOFF_THRESHOLD,
  MAX_AGENT_HANDOFF_THRESHOLD,
  MIN_AGENT_HANDOFF_THRESHOLD,
} from "./handoff-settings";

import type { AgentChatMessage } from "./types";

const IMAGE_TOKEN_ESTIMATE = 765;
const HANDOFF_RESERVE_RATIO = 0.25;
const MIN_HANDOFF_RESERVE_TOKENS = 1_000;
const MAX_HANDOFF_RESERVE_TOKENS = 24_000;

export type AgentContextUsage = {
  usedTokens: number;
  maxTokens: number;
  remainingTokens: number;
  reservedTokens: number;
  triggerThreshold: number;
};

export function estimateAgentContextUsage(input: {
  messages: readonly AgentChatMessage[];
  maxTokens?: number;
  triggerThreshold?: number;
}): AgentContextUsage {
  const maxTokens = normalizePositiveInteger(
    input.maxTokens,
    DEFAULT_MODEL_CONTEXT_WINDOW
  );
  const triggerThreshold = normalizeThreshold(
    input.triggerThreshold,
    DEFAULT_AGENT_HANDOFF_THRESHOLD
  );
  const usedTokens = input.messages.reduce(
    (total, message) => total + estimateAgentMessageTokens(message),
    0
  );
  const remainingTokens = Math.max(maxTokens - usedTokens, 0);
  const reservedTokens = clamp(
    Math.max(
      Math.floor(maxTokens * (1 - triggerThreshold)),
      Math.floor(maxTokens * HANDOFF_RESERVE_RATIO)
    ),
    MIN_HANDOFF_RESERVE_TOKENS,
    Math.min(MAX_HANDOFF_RESERVE_TOKENS, maxTokens)
  );

  return {
    usedTokens,
    maxTokens,
    remainingTokens,
    reservedTokens,
    triggerThreshold,
  };
}

export function shouldTriggerContextHandoff(input: {
  messages: readonly AgentChatMessage[];
  maxTokens?: number;
  triggerThreshold?: number;
}): AgentContextUsage | null {
  if (!hasReplayableWork(input.messages)) {
    return null;
  }

  const usage = estimateAgentContextUsage(input);
  const thresholdTokens = Math.floor(usage.maxTokens * usage.triggerThreshold);

  if (
    usage.usedTokens < thresholdTokens &&
    usage.remainingTokens > usage.reservedTokens
  ) {
    return null;
  }

  return usage;
}

function estimateAgentMessageTokens(message: AgentChatMessage): number {
  let total = 0;

  if (typeof message.content === "string") {
    total += estimateTextTokens(message.content);
  } else if (Array.isArray(message.content)) {
    for (const part of message.content) {
      if (part.type === "text") {
        total += estimateTextTokens(part.text);
        continue;
      }
      if (part.type === "image_url") {
        total += IMAGE_TOKEN_ESTIMATE;
      }
    }
  }

  if (message.reasoning_content) {
    total += estimateTextTokens(message.reasoning_content);
  }

  for (const toolCall of message.tool_calls ?? []) {
    total += estimateTextTokens(toolCall.function.name);
    total += estimateTextTokens(toolCall.function.arguments);
  }

  if (message.tool_call_id) {
    total += estimateTextTokens(message.tool_call_id);
  }

  if (message.name) {
    total += estimateTextTokens(message.name);
  }

  return total;
}

function hasReplayableWork(messages: readonly AgentChatMessage[]): boolean {
  return messages.some((message) => {
    if (message.role === "tool") {
      return true;
    }

    if (message.role !== "assistant") {
      return false;
    }

    if (message.tool_calls?.length) {
      return true;
    }

    if (typeof message.content === "string" && message.content.trim()) {
      return true;
    }

    return Boolean(message.reasoning_content?.trim());
  });
}

function normalizePositiveInteger(value: number | undefined, fallback: number): number {
  if (!Number.isFinite(value) || value === undefined || value <= 0) {
    return fallback;
  }
  return Math.floor(value);
}

function normalizeThreshold(value: number | undefined, fallback: number): number {
  if (!Number.isFinite(value) || value === undefined) {
    return fallback;
  }
  return clamp(
    value,
    MIN_AGENT_HANDOFF_THRESHOLD,
    MAX_AGENT_HANDOFF_THRESHOLD
  );
}

function clamp(value: number, min: number, max: number): number {
  return Math.min(Math.max(value, min), max);
}

export const agentContextMonitorConfig = {
  defaultThreshold: DEFAULT_AGENT_HANDOFF_THRESHOLD,
  reserveRatio: HANDOFF_RESERVE_RATIO,
  minReserveTokens: MIN_HANDOFF_RESERVE_TOKENS,
  maxReserveTokens: MAX_HANDOFF_RESERVE_TOKENS,
} as const;
