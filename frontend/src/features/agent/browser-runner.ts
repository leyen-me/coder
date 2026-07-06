import {
  createToolCallAccumulator,
  type ToolCallDelta,
} from "./tools/parse-tool-call";
import type { AgentEvent, AgentStartInput } from "./types";
import { chatCompletionsUrl } from "./openai-url";

type StreamDelta = {
  content?: string;
  reasoning_content?: string;
  tool_calls?: ToolCallDelta[];
};

type StreamChoice = {
  delta?: StreamDelta;
  finish_reason?: string | null;
};

type StreamChunk = {
  choices?: StreamChoice[];
  usage?: {
    prompt_tokens: number;
    completion_tokens: number;
    total_tokens: number;
  };
};

const activeControllers = new Map<string, AbortController>();

export function consumeSseLines(buffer: string): { lines: string[]; rest: string } {
  const lines: string[] = [];
  let rest = buffer;

  while (true) {
    const lineBreak = rest.indexOf("\n");
    if (lineBreak === -1) {
      break;
    }

    const line = rest.slice(0, lineBreak).trim();
    rest = rest.slice(lineBreak + 1);
    if (line) {
      lines.push(line);
    }
  }

  return { lines, rest };
}

export async function startBrowserAgent(
  input: AgentStartInput,
  onEvent: (event: AgentEvent) => void
): Promise<void> {
  const controller = new AbortController();
  activeControllers.set(input.taskId, controller);

  onEvent({ type: "status", taskId: input.taskId, status: "running" });

  try {
    const response = await fetch(chatCompletionsUrl(input.baseUrl), {
      method: "POST",
      headers: {
        Authorization: `Bearer ${input.apiKey}`,
        "Content-Type": "application/json",
        Accept: "text/event-stream",
      },
      body: JSON.stringify({
        model: input.model,
        messages: input.messages,
        stream: true,
        ...(input.requestExtensions ?? {}),
        ...(input.tools?.length ? { tools: input.tools, tool_choice: "auto" } : {}),
      }),
      signal: controller.signal,
    });

    if (!response.ok) {
      const body = await response.text();
      throw new Error(`API error (${response.status}): ${body}`);
    }

    if (!response.body) {
      throw new Error("Response body is empty");
    }

    const reader = response.body.getReader();
    const decoder = new TextDecoder();
    let buffer = "";
    const toolCalls = createToolCallAccumulator({
      onIdentified: (call) => {
        onEvent({
          type: "tool_call_pending",
          taskId: input.taskId,
          toolCallId: call.id,
          name: call.name,
        });
      },
    });
    let finishReason: string | null = null;
    let chunkUsage: { prompt_tokens: number; completion_tokens: number; total_tokens: number } | undefined;

    while (true) {
      const { done, value } = await reader.read();
      if (value) {
        buffer += decoder.decode(value, { stream: true });
      }

      const consumed = consumeSseLines(buffer);
      buffer = consumed.rest;
      for (const line of consumed.lines) {
        const result = parseSseLine(line, input.taskId, onEvent, toolCalls, finishReason);
        finishReason = result.finishReason ?? finishReason;
        if (result.usage) {
          chunkUsage = result.usage;
        }
      }

      if (done) {
        buffer += decoder.decode();
        const trailing = consumeSseLines(buffer);
        for (const line of trailing.lines) {
          const result = parseSseLine(line, input.taskId, onEvent, toolCalls, finishReason);
          finishReason = result.finishReason ?? finishReason;
          if (result.usage) {
            chunkUsage = result.usage;
          }
        }
        const finalLine = trailing.rest.trim();
        if (finalLine) {
          const result = parseSseLine(finalLine, input.taskId, onEvent, toolCalls, finishReason);
          finishReason = result.finishReason ?? finishReason;
          if (result.usage) {
            chunkUsage = result.usage;
          }
        }
        break;
      }
    }

    if (controller.signal.aborted) {
      onEvent({ type: "status", taskId: input.taskId, status: "cancelled" });
      return;
    }

    const resolvedToolCalls = toolCalls.finalize();
    if (finishReason === "tool_calls" || resolvedToolCalls.length > 0) {
      onEvent({
        type: "turn_complete",
        taskId: input.taskId,
        toolCalls: resolvedToolCalls,
      });
    }

    onEvent({
      type: "done",
      taskId: input.taskId,
      usage: chunkUsage
        ? {
            promptTokens: chunkUsage.prompt_tokens,
            completionTokens: chunkUsage.completion_tokens,
            totalTokens: chunkUsage.total_tokens,
          }
        : undefined,
    });
    onEvent({ type: "status", taskId: input.taskId, status: "completed" });
  } catch (error) {
    if (controller.signal.aborted) {
      onEvent({ type: "status", taskId: input.taskId, status: "cancelled" });
      return;
    }

    const message = error instanceof Error ? error.message : String(error);
    onEvent({ type: "error", taskId: input.taskId, message });
    onEvent({ type: "status", taskId: input.taskId, status: "failed" });
  } finally {
    activeControllers.delete(input.taskId);
  }
}

export async function cancelBrowserAgent(taskId: string): Promise<void> {
  activeControllers.get(taskId)?.abort();
  activeControllers.delete(taskId);
}

function parseSseLine(
  line: string,
  taskId: string,
  onEvent: (event: AgentEvent) => void,
  toolCalls: ReturnType<typeof createToolCallAccumulator>,
  previousFinishReason: string | null
): { finishReason: string | null; usage?: { prompt_tokens: number; completion_tokens: number; total_tokens: number } } {
  if (!line || line.startsWith(":")) {
    return { finishReason: previousFinishReason };
  }

  const payload = line.startsWith("data:") ? line.slice(5).trim() : line;
  if (payload === "[DONE]") {
    return { finishReason: previousFinishReason };
  }

  let parsed: StreamChunk;
  try {
    parsed = JSON.parse(payload) as StreamChunk;
  } catch {
    return { finishReason: previousFinishReason };
  }

  const choice = parsed.choices?.[0];
  const delta = choice?.delta;
  if (delta) {
    if (delta.reasoning_content) {
      const event = {
        type: "thinking_delta",
        taskId,
        delta: delta.reasoning_content,
      } as const;
      onEvent(event);
    }

    if (delta.content) {
      const event = {
        type: "content_delta",
        taskId,
        delta: delta.content,
      } as const;
      onEvent(event);
    }

    if (delta.tool_calls) {
      for (const toolCallDelta of delta.tool_calls) {
        toolCalls.ingest(toolCallDelta);
      }
    }
  }

  return {
    finishReason: choice?.finish_reason ?? previousFinishReason,
    usage: parsed.usage,
  };
}
