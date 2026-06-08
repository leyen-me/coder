import type { MessageProcessStep } from "@/lib/db";

import { deriveMessageFieldsFromProcessSteps } from "./process-steps";

export type StreamingFields = {
  content: string;
  thinking: string;
  processSteps: MessageProcessStep[];
};

const FLUSH_INTERVAL_MS = 50;

function scheduleChange(callback: () => void): number {
  if (typeof requestAnimationFrame === "function") {
    return requestAnimationFrame(callback);
  }

  return setTimeout(callback, 16) as unknown as number;
}

function cancelScheduledChange(id: number): void {
  if (typeof cancelAnimationFrame === "function") {
    cancelAnimationFrame(id);
    return;
  }

  clearTimeout(id);
}

type BufferState = {
  processSteps: MessageProcessStep[];
};

export type StreamingBufferManager = {
  append: (
    messageId: string,
    field: "content" | "thinking",
    delta: string
  ) => void;
  pushToolStep: (messageId: string, toolCallId: string) => void;
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
  const buffers = new Map<string, BufferState>();
  const timers = new Map<string, ReturnType<typeof setTimeout>>();
  const flushChains = new Map<string, Promise<void>>();
  let changeFrameId: number | null = null;

  const emitChangeNow = () => {
    if (changeFrameId !== null) {
      cancelScheduledChange(changeFrameId);
      changeFrameId = null;
    }
    options.onChange();
  };

  const scheduleEmitChange = () => {
    if (changeFrameId !== null) {
      return;
    }

    changeFrameId = scheduleChange(() => {
      changeFrameId = null;
      options.onChange();
    });
  };

  const ensureBuffer = (messageId: string): BufferState => {
    let buffer = buffers.get(messageId);
    if (!buffer) {
      buffer = { processSteps: [] };
      buffers.set(messageId, buffer);
    }
    return buffer;
  };

  const toStreamingFields = (buffer: BufferState): StreamingFields => {
    const { thinking, content } = deriveMessageFieldsFromProcessSteps(
      buffer.processSteps
    );

    return {
      thinking,
      content,
      processSteps: buffer.processSteps.map((step) => ({ ...step })),
    };
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
    appendTextProcessStep(
      buffer.processSteps,
      field === "thinking" ? "reasoning" : "answer",
      delta
    );
    scheduleEmitChange();
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
      scheduleEmitChange();
      scheduleFlush(messageId);
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
      .then(() => options.onFlush(messageId, toStreamingFields(buffer)))
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
    emitChangeNow();
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
    get: (messageId) => {
      const buffer = buffers.get(messageId);
      return buffer ? toStreamingFields(buffer) : null;
    },
    getSnapshot: () =>
      new Map(
        [...buffers.entries()].map(([messageId, buffer]) => [
          messageId,
          toStreamingFields(buffer),
        ])
      ),
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
