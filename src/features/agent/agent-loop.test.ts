import { beforeEach, describe, expect, it, vi } from "vitest";

import { AgentCancellationError } from "./cancellation";
import type { AgentEventHandler, AgentStartInput } from "./types";

const startAgentMock = vi.fn<
  (input: AgentStartInput, onEvent: AgentEventHandler) => Promise<void>
>();
const executeToolCallMock = vi.fn();
const requestProxyDecisionMock = vi.fn();

vi.mock("./runner", () => ({
  startAgent: (input: AgentStartInput, onEvent: AgentEventHandler) =>
    startAgentMock(input, onEvent),
}));

vi.mock("./tools", () => ({
  executeToolCall: (...args: unknown[]) => executeToolCallMock(...args),
  getAgentToolDefinitions: () => [],
  serializeToolResult: (result: unknown) => JSON.stringify(result),
}));

const sleepMock = vi.fn<(ms: number) => Promise<void>>(() => Promise.resolve());

vi.mock("./chat-retry", async (importOriginal) => {
  const actual = await importOriginal<typeof import("./chat-retry")>();
  return {
    ...actual,
    sleep: (ms: number) => sleepMock(ms),
  };
});

vi.mock("./decision/runner", () => ({
  requestProxyDecision: (...args: unknown[]) => requestProxyDecisionMock(...args),
}));

import { runAgentWithTools } from "./agent-loop";

describe("runAgentWithTools", () => {
  beforeEach(() => {
    startAgentMock.mockReset();
    executeToolCallMock.mockReset();
    requestProxyDecisionMock.mockReset();
    sleepMock.mockClear();
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
      { workspaceDir: null, sessionId: "session-1", taskId: "task-1" },
      () => {}
    );

    expect(startAgentMock).toHaveBeenCalledTimes(2);
    expect(executeToolCallMock).toHaveBeenCalledWith(
      "list_dir",
      '{"path":"."}',
      {
        workspaceDir: null,
        sessionId: "session-1",
        taskId: "task-1",
        signal: undefined,
        tavilyConfig: undefined,
        allowPrivateNetworkAccess: undefined,
      }
    );
  });

  it("passes tavilyConfig through to tool execution", async () => {
    executeToolCallMock.mockResolvedValue({
      ok: true,
      tool: "web_search",
      data: { query: "rust async", results: [] },
    });

    const tavilyConfig = {
      apiKeySource: "manual" as const,
      apiKey: "tvly-test-key",
      apiKeyEnvVar: "TAVILY_API_KEY",
    };

    startAgentMock
      .mockImplementationOnce(async (_input, onEvent) => {
        onEvent({
          type: "turn_complete",
          taskId: "task-1",
          toolCalls: [
            {
              id: "call_1",
              name: "web_search",
              arguments: '{"search_term":"rust async"}',
            },
          ],
        });
        onEvent({ type: "status", taskId: "task-1", status: "completed" });
      })
      .mockImplementationOnce(async (_input, onEvent) => {
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
        messages: [{ role: "user", content: "搜索 rust async" }],
      },
      { workspaceDir: null, sessionId: "session-1", taskId: "task-1", tavilyConfig },
      () => {}
    );

    expect(executeToolCallMock).toHaveBeenCalledWith(
      "web_search",
      '{"search_term":"rust async"}',
      {
        workspaceDir: null,
        sessionId: "session-1",
        taskId: "task-1",
        signal: undefined,
        tavilyConfig,
        allowPrivateNetworkAccess: undefined,
      }
    );
  });

  it("stops after a cancelled tool call and does not start another turn", async () => {
    const events: Parameters<AgentEventHandler>[0][] = [];

    startAgentMock.mockImplementationOnce(async (_input, onEvent) => {
      onEvent({
        type: "turn_complete",
        taskId: "task-1",
        toolCalls: [
          {
            id: "call_1",
            name: "shell",
            arguments: '{"command":"npm create vite@latest vue-app"}',
          },
        ],
      });
      onEvent({ type: "status", taskId: "task-1", status: "completed" });
    });

    executeToolCallMock.mockRejectedValue(new AgentCancellationError("task-1"));

    const runPromise = runAgentWithTools(
      {
        taskId: "task-1",
        baseUrl: "https://api.example.com",
        apiKey: "test-key",
        apiKeySource: "manual",
        apiKeyEnvVar: "TEST_API_KEY",
        model: "deepseek-v4-pro",
        messages: [{ role: "user", content: "帮我创建一个 vue 项目" }],
      },
      { workspaceDir: null, sessionId: "session-1", taskId: "task-1", signal: undefined },
      (event) => {
        events.push(event);
      }
    );

    await expect(runPromise).rejects.toThrow("Agent execution cancelled");
    expect(startAgentMock).toHaveBeenCalledTimes(1);
    expect(events).toContainEqual({
      type: "tool_call_started",
      taskId: "task-1",
      toolCallId: "call_1",
      name: "shell",
      input: { command: "npm create vite@latest vue-app" },
    });
    expect(events).toContainEqual({
      type: "tool_call_finished",
      taskId: "task-1",
      toolCallId: "call_1",
      errorText: "Cancelled",
    });
  });

  it("does not cap tool rounds when each round makes progress", async () => {
    executeToolCallMock.mockResolvedValue({
      ok: true,
      tool: "read_file",
      data: { path: "a.ts", content: "ok" },
    });

    const toolRoundCount = 35;
    startAgentMock.mockImplementation(async (_input, onEvent) => {
      const callCount = startAgentMock.mock.calls.length;
      if (callCount <= toolRoundCount) {
        onEvent({
          type: "turn_complete",
          taskId: "task-1",
          toolCalls: [
            {
              id: `call_${callCount}`,
              name: "read_file",
              arguments: `{"path":"file-${callCount}.ts"}`,
            },
          ],
        });
        onEvent({ type: "status", taskId: "task-1", status: "completed" });
        return;
      }

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
        messages: [{ role: "user", content: "检查很多文件" }],
      },
      { workspaceDir: null, sessionId: "session-1", taskId: "task-1" },
      () => {}
    );

    expect(startAgentMock).toHaveBeenCalledTimes(toolRoundCount + 1);
    expect(executeToolCallMock).toHaveBeenCalledTimes(toolRoundCount);
  });

  it("uses proxy decisions to continue unattended long-task sessions", async () => {
    const events: Parameters<AgentEventHandler>[0][] = [];
    requestProxyDecisionMock.mockResolvedValue({
      outcome: "continue",
      selectedOptionId: "continue_conservative",
      reason: "Choose the conservative default and continue implementing.",
      riskLevel: "medium",
      recordAsAssumption: true,
      requiresUserConfirmation: false,
      assumption: "Proceed with the safest default.",
      suggestedContinuation: "Continue with the conservative path.",
    });

    startAgentMock
      .mockImplementationOnce(async (_input, onEvent) => {
        onEvent({
          type: "content_delta",
          taskId: "task-1",
          delta: "我现在需要你决定要不要继续吗？",
        });
        onEvent({ type: "status", taskId: "task-1", status: "completed" });
      })
      .mockImplementationOnce(async (input, onEvent) => {
        expect(input.messages.at(-1)).toEqual({
          role: "system",
          content: expect.stringContaining("## Proxy decision result"),
        });
        onEvent({
          type: "content_delta",
          taskId: "task-1",
          delta: "我将按保守默认继续执行。",
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
        messages: [{ role: "user", content: "继续这个长任务" }],
        sessionKind: "long_task",
        autonomyMode: "unattended",
        decisionPolicyVersion: "mvp-v1",
        decisionModel: "decision-model",
      },
      { workspaceDir: null, sessionId: "session-1", taskId: "task-1" },
      (event) => {
        events.push(event);
      }
    );

    expect(requestProxyDecisionMock).toHaveBeenCalledTimes(1);
    expect(startAgentMock).toHaveBeenCalledTimes(2);
    expect(events).toContainEqual(
      expect.objectContaining({
        type: "decision_requested",
        taskId: "task-1",
        trigger: "blocking_response",
      })
    );
    expect(events).toContainEqual(
      expect.objectContaining({
        type: "decision_resolved",
        taskId: "task-1",
      })
    );
  });

  it("fails when the agent repeats the same tool batch", async () => {
    executeToolCallMock.mockResolvedValue({
      ok: true,
      tool: "read_file",
      data: { path: "a.ts", content: "ok" },
    });

    startAgentMock.mockImplementation(async (_input, onEvent) => {
      onEvent({
        type: "turn_complete",
        taskId: "task-1",
        toolCalls: [
          {
            id: `call_${startAgentMock.mock.calls.length}`,
            name: "read_file",
            arguments: '{"path":"a.ts"}',
          },
        ],
      });
      onEvent({ type: "status", taskId: "task-1", status: "completed" });
    });

    await expect(
      runAgentWithTools(
        {
          taskId: "task-1",
          baseUrl: "https://api.example.com",
          apiKey: "test-key",
          apiKeySource: "manual",
          apiKeyEnvVar: "TEST_API_KEY",
          model: "deepseek-v4-pro",
          messages: [{ role: "user", content: "读 a.ts" }],
        },
        { workspaceDir: null, sessionId: "session-1", taskId: "task-1" },
        () => {}
      )
    ).rejects.toThrow("Agent appears stuck repeating the same tool calls");

    expect(startAgentMock).toHaveBeenCalledTimes(3);
  });

  it("blocks high-risk shell commands in unattended long-task sessions", async () => {
    const events: Parameters<AgentEventHandler>[0][] = [];

    startAgentMock.mockImplementationOnce(async (_input, onEvent) => {
      onEvent({
        type: "turn_complete",
        taskId: "task-1",
        toolCalls: [
          {
            id: "call_1",
            name: "shell",
            arguments: '{"command":"git push origin main"}',
          },
        ],
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
        messages: [{ role: "user", content: "推送到远程主分支" }],
        sessionKind: "long_task",
        autonomyMode: "unattended",
      },
      { workspaceDir: null, sessionId: "session-1", taskId: "task-1" },
      (event) => {
        events.push(event);
      }
    );

    expect(executeToolCallMock).not.toHaveBeenCalled();
    expect(events).toContainEqual(
      expect.objectContaining({
        type: "decision_requested",
        trigger: "tool_guard",
      })
    );
    expect(events).toContainEqual(
      expect.objectContaining({
        type: "decision_resolved",
        response: expect.objectContaining({
          outcome: "ask_user",
          requiresUserConfirmation: true,
          riskLevel: "high",
        }),
      })
    );
  });

  it("retries a chat turn after a transient API failure with no streamed output", async () => {
    const events: Parameters<AgentEventHandler>[0][] = [];

    startAgentMock
      .mockImplementationOnce(async (_input, onEvent) => {
        onEvent({ type: "status", taskId: "task-1", status: "running" });
        onEvent({
          type: "error",
          taskId: "task-1",
          message: "API error (503): service unavailable",
        });
        onEvent({ type: "status", taskId: "task-1", status: "failed" });
      })
      .mockImplementationOnce(async (_input, onEvent) => {
        onEvent({
          type: "content_delta",
          taskId: "task-1",
          delta: "恢复成功。",
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
        messages: [{ role: "user", content: "你好" }],
      },
      { workspaceDir: null, sessionId: "session-1", taskId: "task-1" },
      (event) => {
        events.push(event);
      }
    );

    expect(startAgentMock).toHaveBeenCalledTimes(2);
    expect(sleepMock).toHaveBeenCalledTimes(1);
    expect(events).toContainEqual({
      type: "chat_retry",
      taskId: "task-1",
      attempt: 2,
      maxAttempts: 3,
    });
    expect(events).not.toContainEqual({
      type: "error",
      taskId: "task-1",
      message: "API error (503): service unavailable",
    });
    expect(events).toContainEqual({
      type: "content_delta",
      taskId: "task-1",
      delta: "恢复成功。",
    });
  });

  it("requests a handoff before starting the next turn when context is nearly full", async () => {
    const events: Parameters<AgentEventHandler>[0][] = [];

    await runAgentWithTools(
      {
        taskId: "task-1",
        baseUrl: "https://api.example.com",
        apiKey: "test-key",
        apiKeySource: "manual",
        apiKeyEnvVar: "TEST_API_KEY",
        model: "deepseek-v4-pro",
        maxContextTokens: 4_500,
        messages: [
          { role: "system", content: "System prompt" },
          { role: "user", content: "继续这个长任务" },
          {
            role: "assistant",
            content: "我已经完成了大量检查和修改。".repeat(300),
          },
          {
            role: "tool",
            tool_call_id: "call_1",
            name: "read_file",
            content: "文件输出".repeat(300),
          },
        ],
      },
      { workspaceDir: null, sessionId: "session-1", taskId: "task-1" },
      (event) => {
        events.push(event);
      }
    );

    expect(startAgentMock).not.toHaveBeenCalled();
    expect(events).toContainEqual(
      expect.objectContaining({
        type: "handoff_required",
        taskId: "task-1",
      })
    );
    expect(events).toContainEqual({
      type: "status",
      taskId: "task-1",
      status: "completed",
    });
  });

  it("recovers from stream idle timeout when a tool call was still streaming", async () => {
    const events: Parameters<AgentEventHandler>[0][] = [];

    startAgentMock
      .mockImplementationOnce(async (_input, onEvent) => {
        onEvent({
          type: "tool_call_pending",
          taskId: "task-1",
          toolCallId: "call_1",
          name: "write_file",
        });
        onEvent({
          type: "error",
          taskId: "task-1",
          message: "Stream read timed out: no data received for 120s",
        });
        onEvent({ type: "status", taskId: "task-1", status: "failed" });
      })
      .mockImplementationOnce(async (input, onEvent) => {
        expect(input.messages.at(-1)).toEqual({
          role: "user",
          content:
            "（连接超时：模型在调用 write_file 时停止输出。请从上次停下的地方接着完成该工具调用，不要重复已经完成的内容。）",
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
        messages: [{ role: "user", content: "写个文件" }],
      },
      { workspaceDir: null, sessionId: "session-1", taskId: "task-1" },
      (event) => {
        events.push(event);
      }
    );

    expect(startAgentMock).toHaveBeenCalledTimes(2);
    expect(events).not.toContainEqual(
      expect.objectContaining({
        type: "error",
        message: "Stream read timed out: no data received for 120s",
      })
    );
  });

  it("recovers from stream idle timeout by injecting a user nudge message", async () => {
    const events: Parameters<AgentEventHandler>[0][] = [];

    startAgentMock
      .mockImplementationOnce(async (_input, onEvent) => {
        onEvent({
          type: "content_delta",
          taskId: "task-1",
          delta: "已完成第一步。",
        });
        onEvent({
          type: "error",
          taskId: "task-1",
          message: "Stream read timed out: no data received for 120s",
        });
        onEvent({ type: "status", taskId: "task-1", status: "failed" });
      })
      .mockImplementationOnce(async (input, onEvent) => {
        expect(input.messages).toEqual([
          { role: "user", content: "继续任务" },
          { role: "assistant", content: "已完成第一步。" },
          {
            role: "user",
            content:
              "（连接超时：模型超过一段时间没有继续输出。请从上次停下的地方接着完成，不要重复已经完成的内容。）",
          },
        ]);
        onEvent({
          type: "content_delta",
          taskId: "task-1",
          delta: "继续第二步。",
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
        messages: [{ role: "user", content: "继续任务" }],
      },
      { workspaceDir: null, sessionId: "session-1", taskId: "task-1" },
      (event) => {
        events.push(event);
      }
    );

    expect(startAgentMock).toHaveBeenCalledTimes(2);
    expect(sleepMock).toHaveBeenCalledTimes(1);
    expect(events).toContainEqual({
      type: "chat_retry",
      taskId: "task-1",
      attempt: 2,
      maxAttempts: 3,
    });
    expect(events).not.toContainEqual({
      type: "error",
      taskId: "task-1",
      message: "Stream read timed out: no data received for 120s",
    });
    expect(events).toContainEqual({
      type: "content_delta",
      taskId: "task-1",
      delta: "继续第二步。",
    });
  });

  it("does not retry after partial stream output was already emitted", async () => {
    startAgentMock.mockImplementationOnce(async (_input, onEvent) => {
      onEvent({
        type: "content_delta",
        taskId: "task-1",
        delta: "部分内容",
      });
      onEvent({
        type: "error",
        taskId: "task-1",
        message: "Stream read failed: connection reset",
      });
      onEvent({ type: "status", taskId: "task-1", status: "failed" });
    });

    await expect(
      runAgentWithTools(
        {
          taskId: "task-1",
          baseUrl: "https://api.example.com",
          apiKey: "test-key",
          apiKeySource: "manual",
          apiKeyEnvVar: "TEST_API_KEY",
          model: "deepseek-v4-pro",
          messages: [{ role: "user", content: "你好" }],
        },
        { workspaceDir: null, sessionId: "session-1", taskId: "task-1" },
        () => {}
      )
    ).rejects.toThrow("Stream read failed: connection reset");

    expect(startAgentMock).toHaveBeenCalledTimes(1);
    expect(sleepMock).not.toHaveBeenCalled();
  });

  it("does not retry non-retriable client errors", async () => {
    startAgentMock.mockImplementationOnce(async (_input, onEvent) => {
      onEvent({
        type: "error",
        taskId: "task-1",
        message: "API error (401): unauthorized",
      });
      onEvent({ type: "status", taskId: "task-1", status: "failed" });
    });

    await expect(
      runAgentWithTools(
        {
          taskId: "task-1",
          baseUrl: "https://api.example.com",
          apiKey: "test-key",
          apiKeySource: "manual",
          apiKeyEnvVar: "TEST_API_KEY",
          model: "deepseek-v4-pro",
          messages: [{ role: "user", content: "你好" }],
        },
        { workspaceDir: null, sessionId: "session-1", taskId: "task-1" },
        () => {}
      )
    ).rejects.toThrow("API error (401): unauthorized");

    expect(startAgentMock).toHaveBeenCalledTimes(1);
    expect(sleepMock).not.toHaveBeenCalled();
  });
});
