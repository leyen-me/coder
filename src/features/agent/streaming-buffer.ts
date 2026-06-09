import type { MessageProcessStep, MessageToolInvocation } from "@/lib/db";

import {
  deriveMessageFieldsFromProcessSteps,
  ensureAnswerForReasoningOnlyTurn,
} from "./process-steps";

export type StreamingFields = {
  content: string;
  thinking: string;
  processSteps: MessageProcessStep[];
  toolInvocations: MessageToolInvocation[];
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
  toolInvocations: MessageToolInvocation[];
  /**
   * Memoized derived view. Invalidated (set to `null`) on every mutation and
   * lazily rebuilt at most once per read, so the O(n) derivation runs once per
   * animation frame instead of once per streamed token.
   */
  cached: StreamingFields | null;
};

export type StreamingBufferManager = {
  append: (
    messageId: string,
    field: "content" | "thinking",
    delta: string
  ) => void;
  pushToolStep: (messageId: string, toolCallId: string) => void;
  setToolInvocations: (
    messageId: string,
    toolInvocations: MessageToolInvocation[]
  ) => void;
  flush: (messageId: string) => Promise<void>;
  finalize: (messageId: string) => void;
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
      buffer = { processSteps: [], toolInvocations: [], cached: null };
      buffers.set(messageId, buffer);
    }
    return buffer;
  };

  const toStreamingFields = (buffer: BufferState): StreamingFields => {
    if (buffer.cached) {
      return buffer.cached;
    }

    const { thinking, content } = deriveMessageFieldsFromProcessSteps(
      buffer.processSteps
    );

    // `appendTextProcessStep`/`pushToolStep` only ever replace the last element
    // or push a new one, so a shallow array copy is enough to freeze an
    // immutable snapshot while keeping unchanged step references stable.
    buffer.cached = {
      thinking,
      content,
      processSteps: [...buffer.processSteps],
      toolInvocations: [...buffer.toolInvocations],
    };
    return buffer.cached;
  };

  const applyPromotedSteps = (buffer: BufferState) => {
    const finalizedSteps = ensureAnswerForReasoningOnlyTurn(buffer.processSteps);
    if (finalizedSteps === buffer.processSteps) {
      return;
    }

    buffer.processSteps = finalizedSteps;
    buffer.cached = null;
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
    buffer.cached = null;
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
      buffer.cached = null;
      scheduleEmitChange();
      scheduleFlush(messageId);
    }
  };

  const setToolInvocations = (
    messageId: string,
    toolInvocations: MessageToolInvocation[]
  ) => {
    const buffer = ensureBuffer(messageId);
    buffer.toolInvocations = [...toolInvocations];
    buffer.cached = null;
    scheduleEmitChange();
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

  const finalize = (messageId: string) => {
    const buffer = buffers.get(messageId);
    if (!buffer) {
      return;
    }

    applyPromotedSteps(buffer);
    scheduleEmitChange();
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
    finalize,
    clear,
    flushAndClear,
    pushToolStep,
    setToolInvocations,
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
  const lastIndex = steps.length - 1;
  const lastStep = steps[lastIndex];
  if (lastStep?.kind === kind) {
    // Replace the element instead of mutating it so previously emitted
    // snapshots stay immutable and downstream reference equality holds.
    steps[lastIndex] = { ...lastStep, text: lastStep.text + delta };
    return;
  }

  steps.push({
    id: `${kind}:${steps.length}`,
    kind,
    text: delta,
  });
}
