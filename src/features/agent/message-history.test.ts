import { describe, expect, it } from "vitest";

import type { MessageRecord } from "@/lib/db";

import { messageRecordToAgentMessages } from "./message-history";

describe("messageRecordToAgentMessages", () => {
  it("reconstructs assistant tool-call turns for replay", () => {
    const messages = messageRecordToAgentMessages({
      id: "assistant-1",
      sessionId: "session-1",
      role: "assistant",
      content: "我先看看目录。",
      thinking: "需要先列一下项目结构。",
      processSteps: [
        { id: "reasoning:0", kind: "reasoning", text: "需要先列一下项目结构。" },
        { id: "answer:1", kind: "answer", text: "我先看看目录。" },
        { id: "tool:call_1", kind: "tool", toolCallId: "call_1" },
      ],
      toolInvocations: [
        {
          id: "call_1",
          name: "list_dir",
          input: { path: "." },
          output: {
            ok: true,
            tool: "list_dir",
            data: {
              path: ".",
              entries: [{ name: "src", path: "src", isDir: true }],
            },
          },
          state: "output-available",
        },
      ],
      status: "completed",
      taskId: null,
      error: null,
      createdAt: 1,
    } satisfies MessageRecord);

    expect(messages).toEqual([
      {
        role: "assistant",
        content: "我先看看目录。",
        reasoning_content: "需要先列一下项目结构。",
        tool_calls: [
          {
            id: "call_1",
            type: "function",
            function: {
              name: "list_dir",
              arguments: '{"path":"."}',
            },
          },
        ],
      },
      {
        role: "tool",
        tool_call_id: "call_1",
        name: "list_dir",
        content:
          '{"ok":true,"tool":"list_dir","data":{"path":".","entries":[{"name":"src","path":"src","isDir":true}]}}',
      },
    ]);
  });

  it("rebuilds multi-tool DeepSeek-style chains from process steps", () => {
    const messages = messageRecordToAgentMessages({
      id: "assistant-weather",
      sessionId: "session-1",
      role: "assistant",
      content: "Hangzhou tomorrow is cloudy.",
      thinking: "Need date first.Tomorrow is 2026-04-20.Share weather result.",
      processSteps: [
        {
          id: "reasoning:0",
          kind: "reasoning",
          text: "Need date first.",
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
          text: "Tomorrow is 2026-04-20.",
        },
        { id: "tool:call_2", kind: "tool", toolCallId: "call_2" },
        {
          id: "reasoning:5",
          kind: "reasoning",
          text: "Share weather result.",
        },
        {
          id: "answer:6",
          kind: "answer",
          text: "Hangzhou tomorrow is cloudy.",
        },
      ],
      toolInvocations: [
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
      status: "completed",
      taskId: null,
      error: null,
      createdAt: 1,
    } satisfies MessageRecord);

    expect(messages).toHaveLength(5);
    expect(messages[0]).toMatchObject({
      role: "assistant",
      content: "Let me check tomorrow's weather in Hangzhou for you.",
      reasoning_content: "Need date first.",
    });
    expect(messages[1]?.role).toBe("tool");
    expect(messages[2]).toMatchObject({
      role: "assistant",
      reasoning_content: "Tomorrow is 2026-04-20.",
    });
    expect(messages[3]?.role).toBe("tool");
    expect(messages[4]).toMatchObject({
      role: "assistant",
      content: "Hangzhou tomorrow is cloudy.",
      reasoning_content: "Share weather result.",
    });
  });

  it("omits reasoning for assistant turns without tool calls", () => {
    const messages = messageRecordToAgentMessages({
      id: "assistant-2",
      sessionId: "session-1",
      role: "assistant",
      content: "这是最终回答。",
      thinking: "先分析一下。",
      processSteps: [
        { id: "reasoning:0", kind: "reasoning", text: "先分析一下。" },
        { id: "answer:1", kind: "answer", text: "这是最终回答。" },
      ],
      toolInvocations: [],
      status: "completed",
      taskId: null,
      error: null,
      createdAt: 2,
    } satisfies MessageRecord);

    expect(messages).toEqual([
      {
        role: "assistant",
        content: "这是最终回答。",
      },
    ]);
  });

  it("preserves raw tool input when argument parsing previously failed", () => {
    const messages = messageRecordToAgentMessages({
      id: "assistant-3",
      sessionId: "session-1",
      role: "assistant",
      content: "",
      thinking: "继续尝试工具调用。",
      processSteps: [
        { id: "reasoning:0", kind: "reasoning", text: "继续尝试工具调用。" },
        { id: "tool:call_2", kind: "tool", toolCallId: "call_2" },
      ],
      toolInvocations: [
        {
          id: "call_2",
          name: "list_dir",
          input: { raw: '{"path": }' },
          state: "input-available",
        },
      ],
      status: "completed",
      taskId: null,
      error: null,
      createdAt: 3,
    } satisfies MessageRecord);

    expect(messages).toEqual([
      {
        role: "assistant",
        reasoning_content: "继续尝试工具调用。",
        tool_calls: [
          {
            id: "call_2",
            type: "function",
            function: {
              name: "list_dir",
              arguments: '{"path": }',
            },
          },
        ],
      },
      {
        role: "tool",
        tool_call_id: "call_2",
        name: "list_dir",
        content:
          '{"ok":false,"tool":"list_dir","error":{"code":"missing_output","message":"Tool result was not persisted."}}',
      },
    ]);
  });

  it("falls back to legacy replay when process steps are missing tool boundaries", () => {
    const messages = messageRecordToAgentMessages({
      id: "assistant-4",
      sessionId: "session-1",
      role: "assistant",
      content: "我先看看目录。",
      thinking: "需要先列一下项目结构。",
      processSteps: [
        { id: "reasoning:0", kind: "reasoning", text: "需要先列一下项目结构。" },
        { id: "answer:1", kind: "answer", text: "我先看看目录。" },
      ],
      toolInvocations: [
        {
          id: "call_1",
          name: "list_dir",
          input: { path: "." },
          output: { ok: true, tool: "list_dir", data: { path: "." } },
          state: "output-available",
        },
      ],
      status: "completed",
      taskId: null,
      error: null,
      createdAt: 4,
    } satisfies MessageRecord);

    expect(messages).toEqual([
      {
        role: "assistant",
        content: "我先看看目录。",
        reasoning_content: "需要先列一下项目结构。",
        tool_calls: [
          {
            id: "call_1",
            type: "function",
            function: {
              name: "list_dir",
              arguments: '{"path":"."}',
            },
          },
        ],
      },
      {
        role: "tool",
        tool_call_id: "call_1",
        name: "list_dir",
        content:
          '{"ok":true,"tool":"list_dir","data":{"path":"."}}',
      },
    ]);
  });
});
