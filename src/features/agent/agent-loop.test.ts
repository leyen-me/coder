import { beforeEach, describe, expect, it, vi } from "vitest";

import type { AgentEventHandler, AgentStartInput } from "./types";

const startAgentMock = vi.fn<
  (input: AgentStartInput, onEvent: AgentEventHandler) => Promise<void>
>();
const executeToolCallMock = vi.fn();

vi.mock("./runner", () => ({
  startAgent: (input: AgentStartInput, onEvent: AgentEventHandler) =>
    startAgentMock(input, onEvent),
}));

vi.mock("./tools", () => ({
  executeToolCall: (...args: unknown[]) => executeToolCallMock(...args),
  getAgentToolDefinitions: () => [],
  serializeToolResult: (result: unknown) => JSON.stringify(result),
}));

import { runAgentWithTools } from "./agent-loop";

describe("runAgentWithTools", () => {
  beforeEach(() => {
    startAgentMock.mockReset();
    executeToolCallMock.mockReset();
  });

  it("replays the full assistant tool-call turn into the next request", async () => {
    executeToolCallMock.mockResolvedValue({
      ok: true,
      tool: "list_dir",
      data: { path: ".", entries: [] },
    });

    startAgentMock
      .mockImplementationOnce(async (_input, onEvent) => {
        onEvent({
          type: "thinking_delta",
          taskId: "task-1",
          delta: "先看一下目录。",
        });
        onEvent({
          type: "content_delta",
          taskId: "task-1",
          delta: "我先检查项目结构。",
        });
        onEvent({
          type: "turn_complete",
          taskId: "task-1",
          toolCalls: [
            {
              id: "call_1",
              name: "list_dir",
              arguments: '{"path":"."}',
            },
          ],
        });
        onEvent({ type: "status", taskId: "task-1", status: "completed" });
      })
      .mockImplementationOnce(async (input, onEvent) => {
        expect(input.messages).toEqual([
          { role: "user", content: "帮我看看项目结构" },
          {
            role: "assistant",
            content: "我先检查项目结构。",
            reasoning_content: "先看一下目录。",
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
            content: '{"ok":true,"tool":"list_dir","data":{"path":".","entries":[]}}',
          },
        ]);

        onEvent({
          type: "content_delta",
          taskId: "task-1",
          delta: "目录里有 src 等文件夹。",
        });
        onEvent({ type: "status", taskId: "task-1", status: "completed" });
      });

    await runAgentWithTools(
      {
        taskId: "task-1",
        baseUrl: "https://api.example.com",
        apiKey: "test-key",
        apiKeySource: "manual",
        apiKeyEnvVar: "TEST_API_KEY",
        model: "deepseek-v4-pro",
        messages: [{ role: "user", content: "帮我看看项目结构" }],
      },
      { workspaceDir: null, taskId: "task-1" },
      () => {}
    );

    expect(startAgentMock).toHaveBeenCalledTimes(2);
    expect(executeToolCallMock).toHaveBeenCalledWith(
      "list_dir",
      '{"path":"."}',
      { workspaceDir: null }
    );
  });
});
