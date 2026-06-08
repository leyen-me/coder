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
};

const activeControllers = new Map<string, AbortController>();

export async function startBrowserAgent(
  input: AgentStartInput,
  onEvent: (event: AgentEvent) => void
): Promise<void> {
  if (!input.apiKey.trim()) {
    throw new Error("API key is required");
  }

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
    const toolCalls = createToolCallAccumulator();
    let finishReason: string | null = null;

    while (true) {
      const { done, value } = await reader.read();
      if (done) {
        break;
      }

      buffer += decoder.decode(value, { stream: true });

      while (true) {
        const lineBreak = buffer.indexOf("\n");
        if (lineBreak === -1) {
          break;
        }

        const line = buffer.slice(0, lineBreak).trim();
        buffer = buffer.slice(lineBreak + 1);
        finishReason =
          parseSseLine(line, input.taskId, onEvent, toolCalls, finishReason) ??
          finishReason;
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

    onEvent({ type: "done", taskId: input.taskId });
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
): string | null {
  if (!line || line.startsWith(":")) {
    return previousFinishReason;
  }

  const payload = line.startsWith("data:") ? line.slice(5).trim() : line;
  if (payload === "[DONE]") {
    onEvent({ type: "done", taskId });
    return previousFinishReason;
  }

  let parsed: StreamChunk;
  try {
    parsed = JSON.parse(payload) as StreamChunk;
  } catch {
    return previousFinishReason;
  }

  const choice = parsed.choices?.[0];
  const delta = choice?.delta;
  if (delta) {
    if (delta.reasoning_content) {
      onEvent({
        type: "thinking_delta",
        taskId,
        delta: delta.reasoning_content,
      });
    }

    if (delta.content) {
      onEvent({
        type: "content_delta",
        taskId,
        delta: delta.content,
      });
    }

    if (delta.tool_calls) {
      for (const toolCallDelta of delta.tool_calls) {
        toolCalls.ingest(toolCallDelta);
      }
    }
  }

  return choice?.finish_reason ?? previousFinishReason;
}
