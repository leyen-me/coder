import { describe, expect, it } from "vitest";

import {
  buildAgentMessagesFromProcessSteps,
  deriveMessageFieldsFromProcessSteps,
  ensureAnswerForReasoningOnlyTurn,
} from "./process-steps";

describe("ensureAnswerForReasoningOnlyTurn", () => {
  it("keeps reasoning and adds an answer when the API only streamed reasoning", () => {
    expect(
      ensureAnswerForReasoningOnlyTurn([
        { id: "reasoning:0", kind: "reasoning", text: "你好！" },
      ])
    ).toEqual([
      { id: "reasoning:0", kind: "reasoning", text: "你好！" },
      { id: "answer:1", kind: "answer", text: "你好！" },
    ]);
  });

  it("leaves tool turns unchanged", () => {
    const steps = [
      { id: "reasoning:0", kind: "reasoning", text: "先查一下。" },
      { id: "tool:call_1", kind: "tool", toolCallId: "call_1" },
    ] as const;

    expect(ensureAnswerForReasoningOnlyTurn([...steps])).toEqual([...steps]);
  });
});

describe("deriveMessageFieldsFromProcessSteps", () => {
  it("keeps only the final answer segment after tool calls", () => {
    const fields = deriveMessageFieldsFromProcessSteps([
      { id: "reasoning:0", kind: "reasoning", text: "需要先查日期。" },
      { id: "answer:1", kind: "answer", text: "我先查一下杭州明天的天气。" },
      { id: "tool:call_1", kind: "tool", toolCallId: "call_1" },
      { id: "reasoning:3", kind: "reasoning", text: "日期拿到了，继续查天气。" },
      {
        id: "answer:4",
        kind: "answer",
        text: "杭州明天多云，7 到 13 度。",
      },
    ]);

    expect(fields).toEqual({
      thinking: "需要先查日期。日期拿到了，继续查天气。",
      content: "杭州明天多云，7 到 13 度。",
    });
  });
});

describe("buildAgentMessagesFromProcessSteps", () => {
  it("rebuilds DeepSeek-style assistant/tool chains from process steps", () => {
    const messages = buildAgentMessagesFromProcessSteps(
      [
        {
          id: "reasoning:0",
          kind: "reasoning",
          text: "The user is asking about the weather in Hangzhou tomorrow.",
        },
        {
          id: "answer:1",
          kind: "answer",
          text: "Let me check tomorrow's weather in Hangzhou for you.",
        },
        { id: "tool:call_1", kind: "tool", toolCallId: "call_1" },
        {
          id: "reasoning:3",
          kind: "reasoning",
          text: "Tomorrow is 2026-04-20. Now I'll call the weather function.",
        },
        { id: "tool:call_2", kind: "tool", toolCallId: "call_2" },
        {
          id: "reasoning:5",
          kind: "reasoning",
          text: "The weather result is in. Let me share this with the user.",
        },
        {
          id: "answer:6",
          kind: "answer",
          text: "Here's the weather forecast for Hangzhou tomorrow.",
        },
      ],
      [
        {
          id: "call_1",
          name: "get_date",
          input: {},
          output: "2026-04-20",
          state: "output-available",
        },
        {
          id: "call_2",
          name: "get_weather",
          input: { location: "Hangzhou", date: "2026-04-20" },
          output: "Cloudy 7~13°C",
          state: "output-available",
        },
      ],
      { includeReasoning: true }
    );

    expect(messages).toEqual([
      {
        role: "assistant",
        content: "Let me check tomorrow's weather in Hangzhou for you.",
        reasoning_content:
          "The user is asking about the weather in Hangzhou tomorrow.",
        tool_calls: [
          {
            id: "call_1",
            type: "function",
            function: { name: "get_date", arguments: "{}" },
          },
        ],
      },
      {
        role: "tool",
        tool_call_id: "call_1",
        name: "get_date",
        content: '"2026-04-20"',
      },
      {
        role: "assistant",
        reasoning_content:
          "Tomorrow is 2026-04-20. Now I'll call the weather function.",
        tool_calls: [
          {
            id: "call_2",
            type: "function",
            function: {
              name: "get_weather",
              arguments: '{"location":"Hangzhou","date":"2026-04-20"}',
            },
          },
        ],
      },
      {
        role: "tool",
        tool_call_id: "call_2",
        name: "get_weather",
        content: '"Cloudy 7~13°C"',
      },
      {
        role: "assistant",
        content: "Here's the weather forecast for Hangzhou tomorrow.",
        reasoning_content:
          "The weather result is in. Let me share this with the user.",
      },
    ]);
  });

  it("always emits a tool response after assistant tool_calls", () => {
    const messages = buildAgentMessagesFromProcessSteps(
      [
        { id: "reasoning:0", kind: "reasoning", text: "Need to inspect files." },
        { id: "tool:call_1", kind: "tool", toolCallId: "call_1" },
      ],
      [
        {
          id: "call_1",
          name: "list_dir",
          input: { path: "." },
          state: "input-available",
        },
      ],
      { includeReasoning: true }
    );

    expect(messages).toEqual([
      {
        role: "assistant",
        reasoning_content: "Need to inspect files.",
        tool_calls: [
          {
            id: "call_1",
            type: "function",
            function: { name: "list_dir", arguments: '{"path":"."}' },
          },
        ],
      },
      {
        role: "tool",
        tool_call_id: "call_1",
        name: "list_dir",
        content:
          '{"ok":false,"tool":"list_dir","error":{"code":"missing_output","message":"Tool result was not persisted."}}',
      },
    ]);
  });

  it("omits reasoning when the turn had no tool calls", () => {
    const messages = buildAgentMessagesFromProcessSteps(
      [
        { id: "reasoning:0", kind: "reasoning", text: "先分析一下。" },
        { id: "answer:1", kind: "answer", text: "最终回答。" },
      ],
      [],
      { includeReasoning: false }
    );

    expect(messages).toEqual([
      {
        role: "assistant",
        content: "最终回答。",
      },
    ]);
  });
});
