import type { MessageProcessStep } from "@/lib/db";

export type StreamingFields = {
  content: string;
  thinking: string;
  processSteps: MessageProcessStep[];
};

const FLUSH_INTERVAL_MS = 50;

export type StreamingBufferManager = {
  append: (
    messageId: string,
    field: "content" | "thinking",
    delta: string
  ) => void;
  pushToolStep: (messageId: string, toolCallId: string) => void;
  reclassifyTrailingAnswerStepAsReasoning: (messageId: string) => void;
  flush: (messageId: string) => Promise<void>;
  clear: (messageId: string) => void;
  flushAndClear: (messageId: string) => Promise<void>;
  get: (messageId: string) => StreamingFields | null;
  getSnapshot: () => ReadonlyMap<string, StreamingFields>;
};

export function createStreamingBufferManager(options: {
  onFlush: (messageId: string, fields: StreamingFields) => Promise<void>;
  onChange: () => void;
}): StreamingBufferManager {
  const buffers = new Map<string, StreamingFields>();
  const timers = new Map<string, ReturnType<typeof setTimeout>>();
  const flushChains = new Map<string, Promise<void>>();

  const emitChange = () => {
    options.onChange();
  };

  const ensureBuffer = (messageId: string): StreamingFields => {
    let buffer = buffers.get(messageId);
    if (!buffer) {
      buffer = { content: "", thinking: "", processSteps: [] };
      buffers.set(messageId, buffer);
    }
    return buffer;
  };

  const append = (
    messageId: string,
    field: "content" | "thinking",
    delta: string
  ) => {
    if (!delta) {
      return;
    }

    const buffer = ensureBuffer(messageId);
    buffer[field] += delta;
    appendTextProcessStep(
      buffer.processSteps,
      field === "thinking" ? "reasoning" : "answer",
      delta
    );
    emitChange();
    scheduleFlush(messageId);
  };

  const pushToolStep = (messageId: string, toolCallId: string) => {
    const buffer = ensureBuffer(messageId);
    const lastStep = buffer.processSteps.at(-1);
    if (!(lastStep?.kind === "tool" && lastStep.toolCallId === toolCallId)) {
      buffer.processSteps.push({
        id: `tool:${toolCallId}`,
        kind: "tool",
        toolCallId,
      });
      emitChange();
      scheduleFlush(messageId);
    }
  };

  const reclassifyTrailingAnswerStepAsReasoning = (messageId: string) => {
    const buffer = buffers.get(messageId);
    if (!buffer) {
      return;
    }

    const lastStep = buffer.processSteps.at(-1);
    if (lastStep?.kind === "answer") {
      buffer.processSteps[buffer.processSteps.length - 1] = {
        ...lastStep,
        kind: "reasoning",
      };
      emitChange();
    }
  };

  const scheduleFlush = (messageId: string) => {
    if (timers.has(messageId)) {
      return;
    }

    timers.set(
      messageId,
      setTimeout(() => {
        timers.delete(messageId);
        void flush(messageId);
      }, FLUSH_INTERVAL_MS)
    );
  };

  const flush = async (messageId: string): Promise<void> => {
    const buffer = buffers.get(messageId);
    if (!buffer) {
      return;
    }

    const previous = flushChains.get(messageId) ?? Promise.resolve();
    const next = previous
      .then(() =>
        options.onFlush(messageId, {
          content: buffer.content,
          thinking: buffer.thinking,
          processSteps: buffer.processSteps.map((step) => ({ ...step })),
        })
      )
      .catch(() => {
        // Flush errors are surfaced by the agent event handler.
      });

    flushChains.set(messageId, next);
    await next;
  };

  const cancelScheduledFlush = (messageId: string) => {
    const timer = timers.get(messageId);
    if (timer) {
      clearTimeout(timer);
      timers.delete(messageId);
    }
  };

  const clear = (messageId: string) => {
    if (!buffers.has(messageId)) {
      return;
    }

    buffers.delete(messageId);
    flushChains.delete(messageId);
    emitChange();
  };

  const flushAndClear = async (messageId: string): Promise<void> => {
    cancelScheduledFlush(messageId);
    await flush(messageId);
    clear(messageId);
  };

  return {
    append,
    flush,
    clear,
    flushAndClear,
    pushToolStep,
    reclassifyTrailingAnswerStepAsReasoning,
    get: (messageId) => buffers.get(messageId) ?? null,
    getSnapshot: () => new Map(buffers),
  };
}

function appendTextProcessStep(
  steps: MessageProcessStep[],
  kind: "reasoning" | "answer",
  delta: string
) {
  const lastStep = steps.at(-1);
  if (lastStep?.kind === kind) {
    lastStep.text += delta;
    return;
  }

  steps.push({
    id: `${kind}:${steps.length}`,
    kind,
    text: delta,
  });
}
