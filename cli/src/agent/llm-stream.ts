/**
 * LLM Stream — handles SSE streaming from OpenAI-compatible chat completions API.
 */

import type { AgentChatMessage } from "./types";
import type { ToolDefinition } from "../handlers";
import { resolveThinkingParams, type ThinkingParamsOverride } from "./thinking-config";

type StreamCallbacks = {
  onContent: (delta: string) => void;
  onReasoning: (delta: string) => void;
  onToolCall: (id: string, name: string, args: string) => void;
  onUsage: (usage: { promptTokens: number; completionTokens: number; totalTokens: number }) => void;
  onDone: () => void;
  onError: (error: Error) => void;
};

type StreamOptions = {
  baseUrl: string;
  apiKey: string;
  model: string;
  messages: AgentChatMessage[];
  tools?: ToolDefinition[];
  /** Provider ID used to resolve the correct thinking API params. */
  thinkingProvider?: string;
  /** When set, explicitly enable/disable deep thinking at the API level. */
  thinkingEnabled?: boolean;
  /** Custom override for thinking params (used by custom providers). */
  thinkingOverride?: ThinkingParamsOverride;
  /** Signal to cancel the stream mid-response. */
  signal?: AbortSignal;
};

function chatCompletionsUrl(baseUrl: string): string {
  const trimmed = baseUrl.trim().replace(/\/+$/, "");
  if (trimmed.endsWith("/v1")) {
    return `${trimmed}/chat/completions`;
  }
  return `${trimmed}/v1/chat/completions`;
}

export async function startLLMStream(
  options: StreamOptions,
  callbacks: StreamCallbacks,
): Promise<void> {
  const url = chatCompletionsUrl(options.baseUrl);

  // Build request body
  const body: Record<string, unknown> = {
    model: options.model,
    messages: options.messages.map(formatMessage),
    stream: true,
    stream_options: { include_usage: true },
  };

  if (options.tools && options.tools.length > 0) {
    body.tools = options.tools;
    body.tool_choice = "auto";
  }

  // Merge thinking extension params when explicitly requested
  if (
    options.thinkingEnabled !== undefined &&
    options.thinkingProvider
  ) {
    const thinkingParams = resolveThinkingParams(
      options.thinkingProvider,
      options.thinkingEnabled,
      options.thinkingOverride,
    );
    if (thinkingParams) {
      Object.assign(body, thinkingParams);
    }
  }

  try {
    const response = await fetch(url, {
      method: "POST",
      headers: {
        Authorization: `Bearer ${options.apiKey}`,
        "Content-Type": "application/json",
        Accept: "text/event-stream",
      },
      body: JSON.stringify(body),
      signal: options.signal,
    });

    if (!response.ok) {
      const errorBody = await response.text().catch(() => "");
      throw new Error(`API error (${response.status}): ${errorBody || response.statusText}`);
    }

    if (!response.body) {
      throw new Error("Response body is empty");
    }

    const reader = response.body.getReader();
    const decoder = new TextDecoder();
    let buffer = "";
    const toolCallAccumulator = new ToolCallAccumulator({
      onIdentified: (id, name) => {
        // Called when a tool call is first identified
      },
    });
    let hasToolCalls = false;

    // Cancel the reader when the signal is aborted mid-stream,
    // since reader.read() does not observe the AbortSignal automatically.
    const detachAbort = options.signal
      ? () => {
          try {
            reader.cancel();
          } catch {
            // Reader may already be closed
          }
        }
      : () => {};
    options.signal?.addEventListener("abort", detachAbort, { once: true });

    while (true) {
      if (options.signal?.aborted) {
        break;
      }
      const { done, value } = await reader.read();
      if (done) break;

      buffer += decoder.decode(value, { stream: true });

      while (true) {
        const lineBreak = buffer.indexOf("\n");
        if (lineBreak === -1) break;

        const line = buffer.slice(0, lineBreak).trim();
        buffer = buffer.slice(lineBreak + 1);
        processLine(line, callbacks, toolCallAccumulator);
      }
    }

    // Process any remaining data
    if (buffer.trim()) {
      processLine(buffer.trim(), callbacks, toolCallAccumulator);
    }

    // Finalize tool calls
    const finalToolCalls = toolCallAccumulator.finalize();
    for (const call of finalToolCalls) {
      callbacks.onToolCall(call.id, call.name, call.arguments);
    }

    callbacks.onDone();
  } catch (error) {
    if (error instanceof Error) {
      callbacks.onError(error);
    } else {
      callbacks.onError(new Error(String(error)));
    }
  }
}

function processLine(
  line: string,
  callbacks: StreamCallbacks,
  toolCalls: ToolCallAccumulator,
): void {
  if (!line || line.startsWith(":")) return;

  const payload = line.startsWith("data:") ? line.slice(5).trim() : line;
  if (payload === "[DONE]") return;

  let parsed: Record<string, unknown>;
  try {
    parsed = JSON.parse(payload) as Record<string, unknown>;
  } catch {
    return;
  }

  const choices = parsed.choices as Array<Record<string, unknown>> | undefined;
  const choice = choices?.[0];
  const delta = choice?.delta as Record<string, unknown> | undefined;

  if (delta) {
    // Reasoning content
    if (delta.reasoning_content) {
      callbacks.onReasoning(delta.reasoning_content as string);
    }

    // Text content
    if (delta.content) {
      callbacks.onContent(delta.content as string);
    }

    // Tool calls
    const toolCallDeltas = delta.tool_calls as Array<Record<string, unknown>> | undefined;
    if (toolCallDeltas) {
      for (const tcDelta of toolCallDeltas) {
        const index = tcDelta.index as number;
        const fn = tcDelta.function as Record<string, unknown> | undefined;
        const id = tcDelta.id as string | undefined;

        if (id) {
          toolCalls.startToolCall(index, id, fn?.name as string);
        } else if (fn?.arguments) {
          toolCalls.appendArguments(index, fn.arguments as string);
        }
      }
    }
  }

  // Usage
  const usage = parsed.usage as Record<string, unknown> | undefined;
  if (usage?.prompt_tokens !== undefined) {
    callbacks.onUsage({
      promptTokens: usage.prompt_tokens as number,
      completionTokens: usage.completion_tokens as number,
      totalTokens: usage.total_tokens as number,
    });
  }
}

// ---------------------------------------------------------------------------
// Tool Call Accumulator
// ---------------------------------------------------------------------------

type PendingToolCall = {
  index: number;
  id: string;
  name: string;
  arguments: string;
};

class ToolCallAccumulator {
  private pending: Map<number, PendingToolCall> = new Map();
  private finalized = false;
  private onIdentified: (id: string, name: string) => void;

  constructor(opts: { onIdentified: (id: string, name: string) => void }) {
    this.onIdentified = opts.onIdentified;
  }

  startToolCall(index: number, id: string, name: string): void {
    this.pending.set(index, { index, id, name, arguments: "" });
  }

  appendArguments(index: number, args: string): void {
    const existing = this.pending.get(index);
    if (existing) {
      existing.arguments += args;
    }
  }

  finalize(): Array<{ id: string; name: string; arguments: string }> {
    if (this.finalized) return [];
    this.finalized = true;
    const calls = Array.from(this.pending.values())
      .sort((a, b) => a.index - b.index)
      .map((c) => ({
        id: c.id,
        name: c.name,
        arguments: c.arguments,
      }));
    return calls;
  }
}

// ---------------------------------------------------------------------------
// Message formatter for OpenAI API
// ---------------------------------------------------------------------------

function formatMessage(msg: AgentChatMessage): Record<string, unknown> {
  const formatted: Record<string, unknown> = {
    role: msg.role,
  };

  if (msg.content !== undefined) {
    formatted.content = msg.content;
  }

  if (msg.reasoning_content) {
    formatted.reasoning_content = msg.reasoning_content;
  }

  if (msg.tool_calls) {
    formatted.tool_calls = msg.tool_calls;
  }

  if (msg.tool_call_id) {
    formatted.tool_call_id = msg.tool_call_id;
  }

  if (msg.name) {
    formatted.name = msg.name;
  }

  return formatted;
}
