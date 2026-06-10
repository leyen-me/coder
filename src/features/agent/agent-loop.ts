import {
  executeToolCall,
  getAgentToolDefinitions,
  serializeToolResult,
} from "./tools";
import { AgentCancellationError, isAgentCancellationError, throwIfAborted } from "./cancellation";
import { parseToolCallInput, toolResultToInvocationPatch } from "./tools/tool-display";
import { toApiToolCalls } from "./tools/api-tool-call";
import type { AgentToolCall, TavilyConfig } from "./tools/types";
import { startAgent } from "./runner";
import type { AgentChatMessage, AgentEvent, AgentEventHandler, AgentStartInput } from "./types";
import {
  ToolCallStallDetector,
  agentToolCallStallError,
} from "./tool-call-stall";

type ToolExecutionContextInput = {
  workspaceDir: string | null;
  taskId: string;
  signal?: AbortSignal;
  tavilyConfig?: TavilyConfig | null;
  allowPrivateNetworkAccess?: boolean;
};

export async function runAgentWithTools(
  input: AgentStartInput,
  context: ToolExecutionContextInput,
  onEvent: AgentEventHandler
): Promise<void> {
  let messages = [...input.messages];
  const tools = input.tools ?? getAgentToolDefinitions();
  const stallDetector = new ToolCallStallDetector();

  while (true) {
    throwIfAborted(context.signal, input.taskId);

    const turn = await runSingleAgentTurn(
      {
        ...input,
        messages,
        tools,
      },
      context.signal,
      (event) => {
        if (isAssistantOutputEvent(event)) {
          onEvent(event);
          return;
        }
        onEvent(event);
      }
    );

    if (turn.toolCalls.length === 0) {
      onEvent({ type: "done", taskId: input.taskId });
      onEvent({ type: "status", taskId: input.taskId, status: "completed" });
      return;
    }

    if (stallDetector.record(turn.toolCalls)) {
      throw agentToolCallStallError();
    }

    messages = await appendToolResults(messages, turn, context, onEvent);
  }
}

async function runSingleAgentTurn(
  input: AgentStartInput,
  signal: AbortSignal | undefined,
  onEvent: AgentEventHandler
): Promise<{
  toolCalls: AgentToolCall[];
  content: string;
  reasoningContent: string;
}> {
  return new Promise<{
    toolCalls: AgentToolCall[];
    content: string;
    reasoningContent: string;
  }>((resolve, reject) => {
    let toolCalls: AgentToolCall[] = [];
    let content = "";
    let reasoningContent = "";
    let settled = false;
    let detachAbortListener = () => {};

    const finish = (handler: () => void) => {
      if (settled) {
        return;
      }
      settled = true;
      detachAbortListener();
      handler();
    };

    try {
      throwIfAborted(signal, input.taskId);
    } catch (error) {
      finish(() => reject(error));
      return;
    }

    if (signal) {
      const onAbort = () => {
        finish(() => reject(new AgentCancellationError(input.taskId)));
      };
      detachAbortListener = () => {
        signal.removeEventListener("abort", onAbort);
      };
      signal.addEventListener("abort", onAbort, { once: true });
    }

    void startAgent(input, (event) => {
      if (event.type === "thinking_delta") {
        reasoningContent += event.delta;
        onEvent(event);
        return;
      }

      if (event.type === "content_delta") {
        content += event.delta;
        onEvent(event);
        return;
      }

      if (event.type === "turn_complete") {
        toolCalls = event.toolCalls;
        return;
      }

      if (event.type === "done") {
        return;
      }

      if (event.type === "status") {
        if (event.status === "completed") {
          finish(() => resolve({ toolCalls, content, reasoningContent }));
          return;
        }

        if (
          event.status === "failed" ||
          event.status === "cancelled"
        ) {
          finish(() =>
            reject(new Error(`Agent turn ended with status: ${event.status}`))
          );
          return;
        }
      }

      if (event.type === "error") {
        onEvent(event);
        finish(() => reject(new Error(event.message)));
        return;
      }

      onEvent(event);
    }).catch((error: unknown) => {
      const message = error instanceof Error ? error.message : String(error);
      finish(() => reject(new Error(message)));
    });
  });
}

function isAssistantOutputEvent(event: AgentEvent): boolean {
  return event.type === "thinking_delta" || event.type === "content_delta";
}

async function appendToolResults(
  messages: AgentStartInput["messages"],
  turn: {
    toolCalls: AgentToolCall[];
    content: string;
    reasoningContent: string;
  },
  context: ToolExecutionContextInput,
  onEvent: AgentEventHandler
): Promise<AgentStartInput["messages"]> {
  throwIfAborted(context.signal, context.taskId);

  const assistantMessage: AgentChatMessage = {
    role: "assistant",
    tool_calls: toApiToolCalls(turn.toolCalls),
  };
  if (turn.content.trim()) {
    assistantMessage.content = turn.content;
  }
  if (turn.reasoningContent.trim()) {
    assistantMessage.reasoning_content = turn.reasoningContent;
  }

  const nextMessages = [
    ...messages,
    assistantMessage,
  ];

  for (const call of turn.toolCalls) {
    throwIfAborted(context.signal, context.taskId);

    const input = parseToolCallInput(call.arguments);

    onEvent({
      type: "tool_call_started",
      taskId: context.taskId ?? "",
      toolCallId: call.id,
      name: call.name,
      input,
    });

    let result;
    try {
      result = await executeToolCall(call.name, call.arguments, {
        workspaceDir: context.workspaceDir,
        taskId: context.taskId,
        signal: context.signal,
        tavilyConfig: context.tavilyConfig,
        allowPrivateNetworkAccess: context.allowPrivateNetworkAccess,
      });
    } catch (error) {
      if (isAgentCancellationError(error)) {
        onEvent({
          type: "tool_call_finished",
          taskId: context.taskId ?? "",
          toolCallId: call.id,
          errorText: "Cancelled",
        });
      }
      throw error;
    }

    const patch = toolResultToInvocationPatch(result);
    onEvent({
      type: "tool_call_finished",
      taskId: context.taskId ?? "",
      toolCallId: call.id,
      output: patch.output,
      errorText: patch.errorText,
    });

    nextMessages.push({
      role: "tool",
      tool_call_id: call.id,
      name: call.name,
      content: serializeToolResult(result),
    });
  }

  return nextMessages;
}
