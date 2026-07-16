import { describe, expect, it } from "vitest";

import {
  agentContextMonitorConfig,
  buildAgentContextDiagnostics,
  estimateAgentContextUsage,
} from "./context-monitor";

describe("context-monitor", () => {
  it("counts multimodal messages, reasoning, and tool calls", () => {
    const usage = estimateAgentContextUsage({
      maxTokens: 10_000,
      messages: [
        { role: "system", content: "System prompt" },
        {
          role: "user",
          content: [
            { type: "text", text: "请继续处理这个任务" },
            { type: "image_url", image_url: { url: "data:image/png;base64,abc" } },
          ],
        },
        {
          role: "assistant",
          content: "我先读取几个文件。",
          reasoning_content: "需要先确认当前实现。",
          tool_calls: [
            {
              id: "call_1",
              type: "function",
              function: {
                name: "read_file",
                arguments: '{"path":"src/index.ts"}',
              },
            },
          ],
        },
        {
          role: "tool",
          tool_call_id: "call_1",
          name: "read_file",
          content: '{"path":"src/index.ts","content":"ok"}',
        },
      ],
    });

    expect(usage.usedTokens).toBeGreaterThan(IMAGE_TOKEN_ESTIMATE_BASELINE);
    expect(usage.estimatedTokens).toBeGreaterThan(0);
    expect(usage.remainingTokens).toBe(10_000 - usage.usedTokens);
    expect(usage.reservedTokens).toBeGreaterThan(0);
  });

  it("uses the default threshold configuration when none is provided", () => {
    const usage = estimateAgentContextUsage({
      maxTokens: 20_000,
      messages: [{ role: "assistant", content: "hello" }],
    });

    expect(usage.triggerThreshold).toBe(agentContextMonitorConfig.defaultThreshold);
  });

  it("prefers provider-reported prompt token usage when available", () => {
    const usage = estimateAgentContextUsage({
      maxTokens: 20_000,
      reportedPromptTokens: 5_000,
      messages: [{ role: "assistant", content: "hello" }],
    });

    expect(usage.usedTokens).toBe(5_000);
    expect(usage.estimatedTokens).toBeLessThan(usage.usedTokens);
  });

  it("ignores implausibly large provider-reported prompt usage", () => {
    const usage = estimateAgentContextUsage({
      maxTokens: 2_000_000,
      reportedPromptTokens: 1_476_174,
      messages: [
        {
          role: "assistant",
          content: "简短回复",
        },
        {
          role: "tool",
          tool_call_id: "call_1",
          name: "read_file",
          content: "文件内容".repeat(2_000),
        },
      ],
    });

    expect(usage.usedTokens).toBe(usage.estimatedTokens);
    expect(usage.usedTokens).toBeLessThan(1_476_174);
  });

  it("builds a diagnostic summary with top messages", () => {
    const diagnostics = buildAgentContextDiagnostics({
      maxTokens: 10_000,
      reportedPromptTokens: 2_000,
      messages: [
        { role: "system", content: "System prompt" },
        {
          role: "assistant",
          content: "最终答复",
          reasoning_content: "这是很长的推理".repeat(20),
        },
        {
          role: "tool",
          tool_call_id: "call_1",
          name: "read_file",
          content: "文件内容".repeat(500),
        },
      ],
    });

    expect(diagnostics.messageCount).toBe(3);
    expect(diagnostics.roleCounts.tool).toBe(1);
    expect(diagnostics.reportedPromptTokens).toBe(2_000);
    expect(diagnostics.reportedPromptTokensAccepted).toBe(true);
    expect(diagnostics.topMessages[0]?.role).toBe("tool");
    expect(diagnostics.topMessages[0]?.tokens).toBeGreaterThan(
      diagnostics.topMessages[1]?.tokens ?? 0
    );
  });
});

const IMAGE_TOKEN_ESTIMATE_BASELINE = 765;
