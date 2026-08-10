import type { LanguageModelUsage } from "ai";

import { serializeInvocationToolContent } from "@/features/agent/process-steps";
import type { MessageRecord, SessionRecord } from "@/lib/db";
import {
  DEFAULT_MODEL_CONTEXT_WINDOW,
  findModelDefinition,
  type ModelDefinition,
} from "@/lib/model-provider/model-definition";
import { parseModelValue } from "@/lib/model-provider/resolve-provider-config";

const IMAGE_TOKEN_ESTIMATE = 765;
const SNAPSHOT_TOKEN_ESTIMATE = 2;
const CJK_PATTERN = /[\u4e00-\u9fff\u3400-\u4dbf\uf900-\ufaff]/g;
/** Matches backend `COMPACT_USER_MESSAGE_MAX_TOKENS` for first_kept recovery. */
const COMPACT_TAIL_TOKEN_BUDGET = 20_000;

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
  // Compact summaries are injected as system context for the model.
  if (message.messageKind === "compact") {
    return {
      inputTokens: estimateTextTokens(message.content),
      outputTokens: 0,
      reasoningTokens: 0,
    };
  }

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

function estimateRecordTokensForCompact(record: MessageRecord): number {
  return Math.ceil(record.content.length / 2);
}

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
  let remaining = COMPACT_TAIL_TOKEN_BUDGET;
  for (let i = conversation.length - 1; i >= 0; i -= 1) {
    const entry = conversation[i];
    if (!entry) {
      continue;
    }
    const tokens = estimateRecordTokensForCompact(entry.message);
    if (tokens <= remaining) {
      selected += 1;
      remaining -= tokens;
    } else {
      break;
    }
  }

  if (selected === 0) {
    selected = 1;
  }

  return conversation[conversation.length - selected]?.index ?? 0;
}

/**
 * Mirror backend `model_history_from_latest_compact`:
 * latest compact summary + conversation messages from first_kept onward.
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

function resolveEffectiveMessages(
  messages: readonly MessageRecord[],
  editingMessageId?: string | null
): MessageRecord[] {
  let scoped = [...messages];

  if (editingMessageId) {
    const editIndex = scoped.findIndex(
      (message) => message.id === editingMessageId
    );
    if (editIndex !== -1) {
      scoped = scoped.slice(0, editIndex + 1);
    }
  }

  return modelHistoryFromLatestCompact(scoped);
}

export function estimateSessionContextUsage(input: {
  messages: readonly MessageRecord[];
  systemPrompt?: string | null;
  modelId: string;
  models: readonly ModelDefinition[];
  editingMessageId?: string | null;
  contextUsageSnapshot?: SessionRecord["contextUsageSnapshot"] | null;
}): SessionContextUsage | null {
  const effectiveMessages = resolveEffectiveMessages(
    input.messages,
    input.editingMessageId
  );

  if (effectiveMessages.length === 0) {
    return null;
  }

  const selectedModel = findModelDefinition(
    input.models,
    parseModelValue(input.modelId).modelId
  );
  const maxTokens = selectedModel?.contextWindow ?? DEFAULT_MODEL_CONTEXT_WINDOW;

  // 后端每次收到真实 usage 或压缩后都会写入 session 快照。快照存在时，
  // composer 直接使用同一份 used/max/triggerThreshold，只对快照之后新增的
  // 消息做增量估算，避免 UI 与压缩判断口径不一致。
  const editingIndex = input.editingMessageId
    ? effectiveMessages.findIndex((message) => message.id === input.editingMessageId)
    : -1;
  const snapshot = input.contextUsageSnapshot;
  const snapshotUsable =
    snapshot != null &&
    snapshot.usedTokens > 0 &&
    snapshot.maxTokens > 0 &&
    snapshot.triggerThreshold > 0 &&
    snapshot.updatedAt > 0 &&
    (editingIndex === -1 ||
      effectiveMessages[editingIndex]?.createdAt >= snapshot.updatedAt);
  if (snapshotUsable && snapshot) {
    const boundaryIndex = snapshot.lastMessageId
      ? effectiveMessages.findIndex(
          (message) => message.id === snapshot.lastMessageId
        )
      : -1;
    const newerMessages =
      boundaryIndex >= 0
        ? effectiveMessages.slice(boundaryIndex + 1)
        : effectiveMessages.filter(
            (message) => message.createdAt > snapshot.updatedAt
          );
    const inputTokens =
      snapshot.usedTokens + estimateBackendStyleDeltaTokens(newerMessages);
    return {
      modelId: input.modelId,
      maxTokens: snapshot.maxTokens,
      usedTokens: inputTokens,
      usage: createUsage({
        inputTokens,
        outputTokens: 0,
        reasoningTokens: 0,
      }),
    };
  }

  const compactMessage = effectiveMessages.find(
    (message) => message.messageKind === "compact"
  );
  const compactCreatedAt = compactMessage?.createdAt ?? null;

  // Find the last assistant message that has provider-reported token usage.
  // After compact, only trust checkpoints from messages written after the
  // marker — earlier promptTokens still include the pre-compact window.
  let lastProviderIndex = -1;
  for (let i = effectiveMessages.length - 1; i >= 0; i--) {
    const msg = effectiveMessages[i];
    if (msg.messageKind === "compact") {
      continue;
    }
    if (
      compactCreatedAt != null &&
      msg.createdAt <= compactCreatedAt
    ) {
      continue;
    }
    if (
      msg.role === "assistant" &&
      msg.usage &&
      msg.usage.promptTokens != null &&
      msg.usage.promptTokens > 0
    ) {
      lastProviderIndex = i;
      break;
    }
  }

  let inputTokens: number;
  let outputTokens: number;
  let reasoningTokens: number;

  if (lastProviderIndex >= 0) {
    // Use the last provider-reported prompt_tokens as the total input.
    // This accurately covers the system prompt and all messages through
    // the user message that triggered this assistant response.
    const checkpointMsg = effectiveMessages[lastProviderIndex];
    inputTokens = checkpointMsg.usage!.promptTokens;
    outputTokens = 0;
    reasoningTokens = 0;

    // Messages at or before the checkpoint: use provider completionTokens.
    for (let i = 0; i <= lastProviderIndex; i++) {
      const msg = effectiveMessages[i];
      if (
        msg.messageKind !== "compact" &&
        msg.usage &&
        msg.role === "assistant"
      ) {
        outputTokens += msg.usage.completionTokens;
      }
    }

    // Messages after the checkpoint (e.g. new user messages not yet sent
    // to the API): estimate their input/output/reasoning contribution.
    for (let i = lastProviderIndex + 1; i < effectiveMessages.length; i++) {
      const est = estimateMessageUsage(effectiveMessages[i]);
      inputTokens += est.inputTokens;
      outputTokens += est.outputTokens;
      reasoningTokens += est.reasoningTokens;
    }
  } else {
    // No usable provider usage snapshot (e.g. right after compact, or no
    // completed turns yet). Fall back to heuristic estimation on the
    // model-visible window only.
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

    inputTokens = breakdown.inputTokens;
    outputTokens = breakdown.outputTokens;
    reasoningTokens = breakdown.reasoningTokens;

    const systemPrompt = input.systemPrompt?.trim() ?? "";
    inputTokens += estimateTextTokens(systemPrompt);
  }

  // 压缩判断只看 prompt 占用，因此百分比也应只按 inputTokens 计算。
  const usedTokens = inputTokens;

  return {
    modelId: input.modelId,
    maxTokens,
    usedTokens,
    usage: createUsage({ inputTokens, outputTokens, reasoningTokens }),
  };
}

function estimateBackendStyleDeltaTokens(
  messages: readonly MessageRecord[]
): number {
  return messages.reduce(
    (total, message) => total + estimateBackendStyleRecordTokens(message),
    0
  );
}

function estimateBackendStyleRecordTokens(message: MessageRecord): number {
  let chars = 0;

  if (message.role === "user") {
    chars += utf8Length(message.content);
    if (message.images && message.images.length > 0) {
      chars += utf8Length(
        JSON.stringify(
          message.images.map((image) => ({
            type: "image_url",
            image_url: { url: image.url, detail: "auto" },
          }))
        )
      );
    }
    return Math.ceil(chars / SNAPSHOT_TOKEN_ESTIMATE);
  }

  if (message.role === "assistant") {
    const answerText = (message.processSteps ?? [])
      .map((step) => (step.kind === "answer" ? step.text : ""))
      .join("");
    chars += utf8Length(answerText.length > 0 ? answerText : message.content);
    for (const invocation of message.toolInvocations ?? []) {
      chars += utf8Length(serializeToolOutputLikeBackend(invocation));
    }
  }

  return Math.ceil(chars / SNAPSHOT_TOKEN_ESTIMATE);
}

function serializeToolOutputLikeBackend(
  invocation: NonNullable<MessageRecord["toolInvocations"]>[number]
): string {
  const output = invocation.output;
  if (
    output !== null &&
    typeof output === "object" &&
    "imageDataUrl" in output &&
    typeof output.imageDataUrl === "string"
  ) {
    const data = output as {
      imageDataUrl: string;
      path?: unknown;
      mimeType?: unknown;
    };
    const path = typeof data.path === "string" ? data.path : "";
    const mimeType =
      typeof data.mimeType === "string" ? data.mimeType : "image";
    return JSON.stringify([
      {
        type: "text",
        text: `[${invocation.name}] Read image: ${path} (${mimeType})`,
      },
      {
        type: "image_url",
        image_url: { url: data.imageDataUrl, detail: "auto" },
      },
    ]);
  }
  return JSON.stringify(output ?? null);
}

function utf8Length(value: string): number {
  return new TextEncoder().encode(value).length;
}
