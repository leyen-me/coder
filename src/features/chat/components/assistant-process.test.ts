import { describe, expect, it } from "vitest";

import {
  buildAssistantProcessPresentation,
  buildAssistantProcessSteps,
} from "./assistant-process";

describe("buildAssistantProcessSteps", () => {
  it("builds a full process timeline when reasoning and tools exist", () => {
    const steps = buildAssistantProcessSteps({
      answerText: "已经找到项目结构。",
      thinkingText: "先读取目录，再总结结果。",
      isThinkingStreaming: false,
      showReasoning: true,
      toolInvocations: [
        {
          id: "call_1",
          name: "list_dir",
          input: { path: "." },
          output: { ok: true },
          state: "output-available",
        },
      ],
      isAnswerStreaming: false,
      isMessageStreaming: false,
    });

    expect(steps.map((step) => step.kind)).toEqual([
      "reasoning",
      "tool",
      "answer",
    ]);
  });

  it("degrades to an answer-only step for models without reasoning or tools", () => {
    const steps = buildAssistantProcessSteps({
      answerText: "这是最终回答。",
      thinkingText: "",
      isThinkingStreaming: false,
      showReasoning: false,
      toolInvocations: [],
      isAnswerStreaming: false,
      isMessageStreaming: false,
    });

    expect(steps).toEqual([
      {
        id: "answer",
        kind: "answer",
        text: "这是最终回答。",
        isStreaming: false,
      },
    ]);
  });

  it("uses persisted process steps to preserve tool boundaries", () => {
    const steps = buildAssistantProcessSteps({
      processSteps: [
        { id: "reasoning:0", kind: "reasoning", text: "先打招呼。" },
        { id: "tool:call_1", kind: "tool", toolCallId: "call_1" },
        { id: "reasoning:2", kind: "reasoning", text: "根据目录继续分析。" },
        { id: "answer:3", kind: "answer", text: "你好，我看完项目了。" },
      ],
      answerText: "你好，我看完项目了。",
      thinkingText: "先打招呼。根据目录继续分析。",
      isThinkingStreaming: false,
      showReasoning: true,
      toolInvocations: [
        {
          id: "call_1",
          name: "list_dir",
          input: { path: "." },
          output: { ok: true },
          state: "output-available",
        },
      ],
      isAnswerStreaming: false,
      isMessageStreaming: false,
    });

    expect(steps.map((step) => step.kind)).toEqual([
      "reasoning",
      "tool",
      "reasoning",
      "answer",
    ]);
    expect(steps[0]).toMatchObject({ kind: "reasoning", text: "先打招呼。" });
    expect(steps[2]).toMatchObject({
      kind: "reasoning",
      text: "根据目录继续分析。",
    });
  });
});

describe("buildAssistantProcessPresentation", () => {
  it("merges reasoning and tools into one thinking block with a separate answer", () => {
    const steps = buildAssistantProcessSteps({
      processSteps: [
        { id: "reasoning:0", kind: "reasoning", text: "先打招呼。" },
        { id: "tool:call_1", kind: "tool", toolCallId: "call_1" },
        { id: "reasoning:2", kind: "reasoning", text: "根据目录继续分析。" },
        { id: "answer:3", kind: "answer", text: "你好，我看完项目了。" },
      ],
      answerText: "你好，我看完项目了。",
      thinkingText: "先打招呼。根据目录继续分析。",
      isThinkingStreaming: false,
      showReasoning: true,
      toolInvocations: [
        {
          id: "call_1",
          name: "list_dir",
          input: { path: "." },
          output: { ok: true },
          state: "output-available",
        },
      ],
      isAnswerStreaming: false,
      isMessageStreaming: false,
    });

    const presentation = buildAssistantProcessPresentation(steps);

    expect(presentation.isCompact).toBe(false);
    expect(presentation.isThinkingStreaming).toBe(false);
    expect(presentation.thinkingSegments).toEqual([
      { kind: "text", text: "先打招呼。" },
      {
        kind: "tool",
        invocation: expect.objectContaining({ id: "call_1", name: "list_dir" }),
      },
      { kind: "text", text: "根据目录继续分析。" },
    ]);
    expect(presentation.answer).toEqual({
      text: "你好，我看完项目了。",
      isStreaming: false,
    });
  });

  it("marks short reasoning-only output as compact", () => {
    const presentation = buildAssistantProcessPresentation([
      {
        id: "reasoning",
        kind: "reasoning",
        text: "简单想一下。",
        isStreaming: false,
      },
      {
        id: "answer",
        kind: "answer",
        text: "好的。",
        isStreaming: false,
      },
    ]);

    expect(presentation.isCompact).toBe(true);
    expect(presentation.thinkingSegments).toEqual([
      { kind: "text", text: "简单想一下。" },
    ]);
  });

  it("treats pending tools as streaming thinking", () => {
    const presentation = buildAssistantProcessPresentation([
      {
        id: "reasoning",
        kind: "reasoning",
        text: "读取目录。",
        isStreaming: false,
      },
      {
        id: "tool:call_1",
        kind: "tool",
        invocation: {
          id: "call_1",
          name: "list_dir",
          input: { path: "." },
          state: "input-available",
        },
      },
    ]);

    expect(presentation.isThinkingStreaming).toBe(true);
    expect(presentation.answer).toBeNull();
  });
});
