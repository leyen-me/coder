import { describe, expect, it } from "vitest";

import { buildAssistantProcessSteps } from "./assistant-process";

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
