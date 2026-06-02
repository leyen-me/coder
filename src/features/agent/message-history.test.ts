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
              entries: [{ name: "src", path: "src", kind: "directory" }],
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
          '{"ok":true,"tool":"list_dir","data":{"path":".","entries":[{"name":"src","path":"src","kind":"directory"}]}}',
      },
    ]);
  });

  it("preserves raw tool input when argument parsing previously failed", () => {
    const messages = messageRecordToAgentMessages({
      id: "assistant-2",
      sessionId: "session-1",
      role: "assistant",
      content: "",
      thinking: "继续尝试工具调用。",
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
      createdAt: 2,
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
    ]);
  });
});
