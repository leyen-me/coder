import { describe, expect, it } from "vitest";

import {
  buildAssistantProcessSteps,
  getAssistantProcessInteriorSteps,
  getAssistantTimelineSteps,
  getLatestAssistantAnswerText,
  shouldRenderStandaloneAssistantAnswer,
  shouldShowAssistantProcessTimeline,
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

  it("keeps streaming answers visible in the ordered timeline", () => {
    const steps = buildAssistantProcessSteps({
      processSteps: [
        { id: "reasoning:0", kind: "reasoning", text: "先打招呼。" },
        { id: "answer:1", kind: "answer", text: "我先看看目录。" },
        { id: "tool:call_1", kind: "tool", toolCallId: "call_1" },
        { id: "reasoning:3", kind: "reasoning", text: "根据目录继续分析。" },
        { id: "answer:4", kind: "answer", text: "项目结构如下。" },
      ],
      answerText: "项目结构如下。",
      thinkingText: "先打招呼。根据目录继续分析。",
      isThinkingStreaming: true,
      showReasoning: true,
      toolInvocations: [
        {
          id: "call_1",
          name: "list_dir",
          input: { path: "." },
          state: "input-available",
        },
      ],
      isAnswerStreaming: true,
      isMessageStreaming: true,
    });

    expect(steps.map((step) => step.kind)).toEqual([
      "reasoning",
      "answer",
      "tool",
      "reasoning",
      "answer",
    ]);
    expect(steps.at(-1)).toMatchObject({
      kind: "answer",
      text: "项目结构如下。",
      isStreaming: true,
    });
  });

  it("marks only the last text step as streaming", () => {
    const steps = buildAssistantProcessSteps({
      processSteps: [
        { id: "reasoning:0", kind: "reasoning", text: "先打招呼。" },
        { id: "answer:1", kind: "answer", text: "我先看看目录。" },
        { id: "tool:call_1", kind: "tool", toolCallId: "call_1" },
        { id: "reasoning:3", kind: "reasoning", text: "根据目录继续分析。" },
        { id: "answer:4", kind: "answer", text: "项目结构如下。" },
      ],
      answerText: "项目结构如下。",
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
      isAnswerStreaming: true,
      isMessageStreaming: true,
    });

    expect(steps[0]).toMatchObject({ kind: "reasoning", isStreaming: false });
    expect(steps[1]).toMatchObject({ kind: "answer", isStreaming: false });
    expect(steps[3]).toMatchObject({ kind: "reasoning", isStreaming: false });
    expect(steps.at(-1)).toMatchObject({
      kind: "answer",
      text: "项目结构如下。",
      isStreaming: true,
    });
  });

  it("falls back to reasoning plus answer when no persisted steps exist", () => {
    const steps = buildAssistantProcessSteps({
      answerText: "好的。",
      thinkingText: "简单想一下。",
      isThinkingStreaming: false,
      showReasoning: true,
      toolInvocations: [],
      isAnswerStreaming: false,
      isMessageStreaming: false,
    });

    expect(steps).toEqual([
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
  });

  it("returns the latest answer text from the timeline", () => {
    const steps = buildAssistantProcessSteps({
      processSteps: [
        { id: "reasoning:0", kind: "reasoning", text: "先打招呼。" },
        { id: "answer:1", kind: "answer", text: "我先看看目录。" },
        { id: "tool:call_1", kind: "tool", toolCallId: "call_1" },
        { id: "reasoning:3", kind: "reasoning", text: "根据目录继续分析。" },
        { id: "answer:4", kind: "answer", text: "项目结构如下。" },
      ],
      answerText: "项目结构如下。",
      thinkingText: "先打招呼。根据目录继续分析。",
      isThinkingStreaming: false,
      showReasoning: true,
      toolInvocations: [],
      isAnswerStreaming: false,
      isMessageStreaming: false,
    });

    expect(getLatestAssistantAnswerText(steps)).toBe("项目结构如下。");
  });

  it("returns an empty string when there is no answer step", () => {
    expect(
      getLatestAssistantAnswerText([
        {
          id: "reasoning",
          kind: "reasoning",
          text: "读取目录。",
          isStreaming: false,
        },
      ])
    ).toBe("");
  });

  it("keeps answer steps in the timeline for non-plan messages", () => {
    const steps = buildAssistantProcessSteps({
      processSteps: [
        { id: "reasoning:0", kind: "reasoning", text: "先打招呼。" },
        { id: "answer:1", kind: "answer", text: "你好！" },
      ],
      answerText: "你好！",
      thinkingText: "先打招呼。",
      isThinkingStreaming: false,
      showReasoning: true,
      toolInvocations: [],
      isAnswerStreaming: false,
      isMessageStreaming: false,
    });

    expect(
      getAssistantTimelineSteps({ steps, isPlanMessage: false }).map(
        (step) => step.kind
      )
    ).toEqual(["reasoning", "answer"]);
    expect(
      shouldRenderStandaloneAssistantAnswer({ steps, isPlanMessage: false })
    ).toBe(false);
    expect(
      shouldShowAssistantProcessTimeline({ steps, isPlanMessage: false })
    ).toBe(true);
  });

  it("keeps answer steps in the timeline for plan messages (same as non-plan)", () => {
    const steps = buildAssistantProcessSteps({
      processSteps: [
        { id: "reasoning:0", kind: "reasoning", text: "先分析需求。" },
        { id: "answer:1", kind: "answer", text: "这是计划。" },
      ],
      answerText: "这是计划。",
      thinkingText: "先分析需求。",
      isThinkingStreaming: false,
      showReasoning: true,
      toolInvocations: [],
      isAnswerStreaming: false,
      isMessageStreaming: false,
    });

    expect(
      getAssistantTimelineSteps({ steps, isPlanMessage: true }).map(
        (step) => step.kind
      )
    ).toEqual(["reasoning", "answer"]);
    expect(
      shouldRenderStandaloneAssistantAnswer({ steps, isPlanMessage: true })
    ).toBe(false);
    expect(
      shouldShowAssistantProcessTimeline({ steps, isPlanMessage: true })
    ).toBe(true);
  });

  it("hides only the final interior answer after the turn finishes", () => {
    const steps = buildAssistantProcessSteps({
      processSteps: [
        { id: "reasoning:0", kind: "reasoning", text: "先分析一下。" },
        { id: "answer:1", kind: "answer", text: "这是最终答案。" },
      ],
      answerText: "这是最终答案。",
      thinkingText: "先分析一下。",
      isThinkingStreaming: false,
      showReasoning: true,
      toolInvocations: [],
      isAnswerStreaming: false,
      isMessageStreaming: false,
    });

    expect(
      getAssistantProcessInteriorSteps({
        steps,
        isMessageStreaming: false,
      }).map((step) => step.kind)
    ).toEqual(["reasoning"]);
  });

  it("keeps intermediate interior answers but hides the final one", () => {
    const steps = buildAssistantProcessSteps({
      processSteps: [
        { id: "answer:1", kind: "answer", text: "我先看看目录。" },
        { id: "tool:call_1", kind: "tool", toolCallId: "call_1" },
        { id: "answer:4", kind: "answer", text: "项目结构如下。" },
      ],
      answerText: "项目结构如下。",
      thinkingText: "",
      isThinkingStreaming: false,
      showReasoning: false,
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

    expect(
      getAssistantProcessInteriorSteps({
        steps,
        isMessageStreaming: false,
      }).map((step) => step.kind)
    ).toEqual(["answer", "tool"]);
    expect(
      getAssistantProcessInteriorSteps({
        steps,
        isMessageStreaming: false,
      })[0]
    ).toMatchObject({
      kind: "answer",
      text: "我先看看目录。",
    });
  });

  it("keeps interior answer steps while the turn is still streaming", () => {
    const steps = buildAssistantProcessSteps({
      processSteps: [
        { id: "reasoning:0", kind: "reasoning", text: "先分析一下。" },
        { id: "answer:1", kind: "answer", text: "这是最终答案。" },
      ],
      answerText: "这是最终答案。",
      thinkingText: "先分析一下。",
      isThinkingStreaming: false,
      showReasoning: true,
      toolInvocations: [],
      isAnswerStreaming: true,
      isMessageStreaming: true,
    });

    expect(
      getAssistantProcessInteriorSteps({
        steps,
        isMessageStreaming: true,
      }).map((step) => step.kind)
    ).toEqual(["reasoning", "answer"]);
  });

  it("renders answer-only non-plan turns without the process timeline", () => {
    const steps = buildAssistantProcessSteps({
      processSteps: [],
      answerText: "你好！",
      thinkingText: "",
      isThinkingStreaming: false,
      showReasoning: false,
      toolInvocations: [],
      isAnswerStreaming: false,
      isMessageStreaming: false,
    });

    expect(steps.map((step) => step.kind)).toEqual(["answer"]);
    expect(
      shouldShowAssistantProcessTimeline({ steps, isPlanMessage: false })
    ).toBe(false);
    expect(
      shouldRenderStandaloneAssistantAnswer({ steps, isPlanMessage: false })
    ).toBe(true);
  });

  it("renders answer-only non-plan turns standalone when reasoning is hidden", () => {
    const steps = buildAssistantProcessSteps({
      processSteps: [
        { id: "reasoning:0", kind: "reasoning", text: "先想一下。" },
      ],
      answerText: "你好！",
      thinkingText: "先想一下。",
      isThinkingStreaming: false,
      showReasoning: false,
      toolInvocations: [],
      isAnswerStreaming: false,
      isMessageStreaming: false,
    });

    expect(steps.map((step) => step.kind)).toEqual(["answer"]);
    expect(
      shouldShowAssistantProcessTimeline({ steps, isPlanMessage: false })
    ).toBe(false);
    expect(
      shouldRenderStandaloneAssistantAnswer({ steps, isPlanMessage: false })
    ).toBe(true);
  });

  it("appends a fallback answer when persisted steps only contain reasoning", () => {
    const steps = buildAssistantProcessSteps({
      processSteps: [
        { id: "reasoning:0", kind: "reasoning", text: "先想一下。" },
      ],
      answerText: "你好！",
      thinkingText: "先想一下。",
      isThinkingStreaming: false,
      showReasoning: false,
      toolInvocations: [],
      isAnswerStreaming: false,
      isMessageStreaming: false,
    });

    expect(steps).toEqual([
      {
        id: "answer:compat",
        kind: "answer",
        text: "你好！",
        isStreaming: false,
      },
    ]);
  });

  it("upgrades the latest persisted answer text when content is newer", () => {
    const steps = buildAssistantProcessSteps({
      processSteps: [
        { id: "reasoning:0", kind: "reasoning", text: "先想一下。" },
        { id: "answer:1", kind: "answer", text: "你" },
      ],
      answerText: "你好！",
      thinkingText: "先想一下。",
      isThinkingStreaming: false,
      showReasoning: true,
      toolInvocations: [],
      isAnswerStreaming: true,
      isMessageStreaming: true,
    });

    expect(steps.at(-1)).toEqual({
      id: "answer:1",
      kind: "answer",
      text: "你好！",
      isStreaming: true,
    });
  });

  it("shows both reasoning and answer when the API only streamed reasoning text", () => {
    const steps = buildAssistantProcessSteps({
      processSteps: [
        {
          id: "reasoning:0",
          kind: "reasoning",
          text: "你好！有什么我可以帮你的吗？😊",
        },
        {
          id: "answer:1",
          kind: "answer",
          text: "你好！有什么我可以帮你的吗？😊",
        },
      ],
      answerText: "你好！有什么我可以帮你的吗？😊",
      thinkingText: "你好！有什么我可以帮你的吗？😊",
      isThinkingStreaming: false,
      showReasoning: true,
      toolInvocations: [],
      isAnswerStreaming: false,
      isMessageStreaming: false,
    });

    expect(steps.map((step) => step.kind)).toEqual(["reasoning", "answer"]);
  });

  it("keeps reasoning visible while a no-tool turn is still streaming", () => {
    const steps = buildAssistantProcessSteps({
      answerText: "",
      thinkingText: "你好！有什么我可以帮你的吗？😊",
      isThinkingStreaming: true,
      showReasoning: true,
      toolInvocations: [],
      isAnswerStreaming: false,
      isMessageStreaming: true,
    });

    expect(steps).toEqual([
      {
        id: "reasoning",
        kind: "reasoning",
        text: "你好！有什么我可以帮你的吗？😊",
        isStreaming: true,
      },
    ]);
  });
});
