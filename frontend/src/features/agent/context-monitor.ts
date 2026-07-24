import { estimateTextTokens } from "@/features/chat/lib/estimate-session-context-usage";
import { DEFAULT_MODEL_CONTEXT_WINDOW } from "@/lib/model-provider/model-definition";
import {
  DEFAULT_AGENT_SESSION_THRESHOLD,
  MAX_AGENT_SESSION_THRESHOLD,
  MIN_AGENT_SESSION_THRESHOLD,
} from "./session-settings";

import type { AgentChatMessage } from "./types";

const IMAGE_TOKEN_ESTIMATE = 765;
const SESSION_RESERVE_RATIO = 0.25;
const MIN_SESSION_RESERVE_TOKENS = 1_000;
const MAX_SESSION_RESERVE_TOKENS = 24_000;
const MAX_REPORTED_ESTIMATE_RATIO = 6;
const MAX_REPORTED_ESTIMATE_DELTA = 48_000;

export type AgentContextUsage = {
  usedTokens: number;
  estimatedTokens: number;
  maxTokens: number;
  remainingTokens: number;
  reservedTokens: number;
  triggerThreshold: number;
};

export type AgentContextMessageDiagnostic = {
  index: number;
  role: AgentChatMessage["role"];
  name: string | null;
  tokens: number;
  contentChars: number;
  reasoningChars: number;
  toolCallCount: number;
  preview: string | null;
};

export type AgentContextDiagnostics = AgentContextUsage & {
  reportedPromptTokens: number | null;
  reportedPromptTokensAccepted: boolean;
  messageCount: number;
  roleCounts: Record<AgentChatMessage["role"], number>;
  topMessages: AgentContextMessageDiagnostic[];
};

export function estimateAgentContextUsage(input: {
  messages: readonly AgentChatMessage[];
  maxTokens?: number;
  triggerThreshold?: number;
  reportedPromptTokens?: number | null;
}): AgentContextUsage {
  const maxTokens = normalizePositiveInteger(
    input.maxTokens,
    DEFAULT_MODEL_CONTEXT_WINDOW
  );
  const triggerThreshold = normalizeThreshold(
    input.triggerThreshold,
    DEFAULT_AGENT_SESSION_THRESHOLD
  );
  const estimatedTokens = input.messages.reduce(
    (total, message) => total + estimateAgentMessageTokens(message),
    0
  );
  const usedTokens = normalizeReportedTokens(
    input.reportedPromptTokens,
    estimatedTokens
  );
  const remainingTokens = Math.max(maxTokens - usedTokens, 0);
  const reservedTokens = clamp(
    Math.max(
      Math.floor(maxTokens * (1 - triggerThreshold)),
      Math.floor(maxTokens * SESSION_RESERVE_RATIO)
    ),
    MIN_SESSION_RESERVE_TOKENS,
    Math.min(MAX_SESSION_RESERVE_TOKENS, maxTokens)
  );

  return {
    usedTokens,
    estimatedTokens,
    maxTokens,
    remainingTokens,
    reservedTokens,
    triggerThreshold,
  };
}

export function buildAgentContextDiagnostics(input: {
  messages: readonly AgentChatMessage[];
  maxTokens?: number;
  triggerThreshold?: number;
  reportedPromptTokens?: number | null;
  topMessageLimit?: number;
}): AgentContextDiagnostics {
  const usage = estimateAgentContextUsage(input);
  const roleCounts: Record<AgentChatMessage["role"], number> = {
    system: 0,
    user: 0,
    assistant: 0,
    tool: 0,
  };
  const topMessageLimit = Math.max(1, input.topMessageLimit ?? 8);
  const topMessages = input.messages
    .map((message, index) => {
      roleCounts[message.role] += 1;
      const contentChars = measureMessageContentChars(message);
      const reasoningChars = message.reasoning_content?.length ?? 0;
      return {
        index,
        role: message.role,
        name: message.name?.trim() || null,
        tokens: estimateAgentMessageTokens(message),
        contentChars,
        reasoningChars,
        toolCallCount: message.tool_calls?.length ?? 0,
        preview: previewMessage(message),
      } satisfies AgentContextMessageDiagnostic;
    })
    .sort((a, b) => b.tokens - a.tokens)
    .slice(0, topMessageLimit);

  const reportedPromptTokens =
    typeof input.reportedPromptTokens === "number" &&
    Number.isFinite(input.reportedPromptTokens) &&
    input.reportedPromptTokens > 0
      ? Math.floor(input.reportedPromptTokens)
      : null;

  return {
    ...usage,
    reportedPromptTokens,
    reportedPromptTokensAccepted:
      reportedPromptTokens !== null &&
      isReportedPromptTokensPlausible(
        reportedPromptTokens,
        usage.estimatedTokens
      ),
    messageCount: input.messages.length,
    roleCounts,
    topMessages,
  };
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

function normalizePositiveInteger(value: number | undefined, fallback: number): number {
  if (!Number.isFinite(value) || value === undefined || value <= 0) {
    return fallback;
  }
  return Math.floor(value);
}

function normalizeReportedTokens(
  reportedPromptTokens: number | null | undefined,
  estimatedTokens: number
): number {
  if (
    typeof reportedPromptTokens === "number" &&
    Number.isFinite(reportedPromptTokens) &&
    reportedPromptTokens > 0
  ) {
    if (!isReportedPromptTokensPlausible(reportedPromptTokens, estimatedTokens)) {
      return estimatedTokens;
    }
    return Math.max(Math.floor(reportedPromptTokens), estimatedTokens);
  }
  return estimatedTokens;
}

function isReportedPromptTokensPlausible(
  reportedPromptTokens: number,
  estimatedTokens: number
): boolean {
  if (estimatedTokens <= 0) {
    return true;
  }

  const maxReasonableTokens = Math.max(
    Math.floor(estimatedTokens * MAX_REPORTED_ESTIMATE_RATIO),
    estimatedTokens + MAX_REPORTED_ESTIMATE_DELTA
  );

  return reportedPromptTokens <= maxReasonableTokens;
}

function measureMessageContentChars(message: AgentChatMessage): number {
  if (typeof message.content === "string") {
    return message.content.length;
  }

  if (!Array.isArray(message.content)) {
    return 0;
  }

  return message.content.reduce((total, part) => {
    if (part.type === "text") {
      return total + part.text.length;
    }
    return total;
  }, 0);
}

function previewMessage(message: AgentChatMessage, maxChars = 160): string | null {
  const segments: string[] = [];

  if (typeof message.content === "string" && message.content.trim()) {
    segments.push(message.content.trim());
  } else if (Array.isArray(message.content)) {
    for (const part of message.content) {
      if (part.type === "text" && part.text.trim()) {
        segments.push(part.text.trim());
      }
    }
  }

  if (message.reasoning_content?.trim()) {
    segments.push(message.reasoning_content.trim());
  }

  if (segments.length === 0) {
    return null;
  }

  const combined = segments.join(" | ");
  return combined.length > maxChars
    ? `${combined.slice(0, maxChars)}...`
    : combined;
}

function normalizeThreshold(value: number | undefined, fallback: number): number {
  if (!Number.isFinite(value) || value === undefined) {
    return fallback;
  }
  return clamp(
    value,
    MIN_AGENT_SESSION_THRESHOLD,
    MAX_AGENT_SESSION_THRESHOLD
  );
}

function clamp(value: number, min: number, max: number): number {
  return Math.min(Math.max(value, min), max);
}

export const agentContextMonitorConfig = {
  defaultThreshold: DEFAULT_AGENT_SESSION_THRESHOLD,
  reserveRatio: SESSION_RESERVE_RATIO,
  minReserveTokens: MIN_SESSION_RESERVE_TOKENS,
  maxReserveTokens: MAX_SESSION_RESERVE_TOKENS,
} as const;
