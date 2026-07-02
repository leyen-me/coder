/**
 * CLI Agent Runner
 *
 * Manages the multi-turn agent loop. This is a CLI-native implementation
 * that bypasses Tauri entirely and uses direct API calls + Node.js tool handlers.
 */

import { executeToolCall, getToolDefinitions } from "../handlers";
import type { ToolExecutionContext, ToolResultEnvelope } from "../handlers/types";
import type { AgentChatMessage, AgentEvent, AgentEventHandler, AgentStartInput, AgentMode } from "./types";
import { startLLMStream } from "./llm-stream";
import type { ThinkingParamsOverride } from "./thinking-config";

// ---------------------------------------------------------------------------
// Multi-turn agent loop
// ---------------------------------------------------------------------------

type AgentTurnResult = {
  toolCalls: Array<{ id: string; name: string; arguments: string }>;
  content: string;
  reasoningContent: string;
  usage?: { promptTokens: number; completionTokens: number; totalTokens: number };
};

export async function runAgentWithTools(
  input: AgentStartInput,
  toolContext: ToolExecutionContext,
  onEvent: AgentEventHandler,
): Promise<AgentChatMessage[]> {
  let messages = [...input.messages];
  let cumulativeUsage: AgentTurnResult["usage"] | undefined;

  while (true) {
    const turn = await runSingleAgentTurn(input, messages, onEvent);

    // Accumulate usage
    if (turn.usage) {
      cumulativeUsage = cumulativeUsage
        ? {
            promptTokens: cumulativeUsage.promptTokens + turn.usage.promptTokens,
            completionTokens: cumulativeUsage.completionTokens + turn.usage.completionTokens,
            totalTokens: cumulativeUsage.totalTokens + turn.usage.totalTokens,
          }
        : turn.usage;
    }

    // No tool calls — agent is done
    if (turn.toolCalls.length === 0) {
      // Append the final assistant response to messages for context persistence
      if (turn.content || turn.reasoningContent) {
        messages = [
          ...messages,
          {
            role: "assistant",
            content: turn.content || "",
            reasoning_content: turn.reasoningContent || undefined,
          },
        ];
      }
      onEvent({ type: "done", taskId: input.taskId, usage: cumulativeUsage ?? turn.usage });
      onEvent({ type: "status", taskId: input.taskId, status: "completed" });
      return messages;
    }

    // Execute tools and append results
    messages = await appendToolResults(messages, turn, toolContext, onEvent);
  }
}

// ---------------------------------------------------------------------------
// Single turn — stream from LLM and collect tool calls
// ---------------------------------------------------------------------------

async function runSingleAgentTurn(
  input: AgentStartInput,
  messages: AgentChatMessage[],
  onEvent: AgentEventHandler,
): Promise<AgentTurnResult> {
  return new Promise<AgentTurnResult>((resolve, reject) => {
    let content = "";
    let reasoningContent = "";
    const toolCalls: Array<{ id: string; name: string; arguments: string }> = [];
    let turnUsage: AgentTurnResult["usage"] | undefined;

    startLLMStream(
      {
        baseUrl: input.baseUrl,
        apiKey: input.apiKey,
        model: input.model,
        messages,
        tools: getToolDefinitions(input.agentMode),
        thinkingProvider: input.provider,
        thinkingEnabled: input.thinkingEnabled,
        thinkingOverride: input.thinkingParams,
      },
      {
        onContent: (delta: string) => {
          content += delta;
          onEvent({ type: "content_delta", taskId: input.taskId, delta });
        },
        onReasoning: (delta: string) => {
          reasoningContent += delta;
          onEvent({ type: "thinking_delta", taskId: input.taskId, delta });
        },
        onToolCall: (id: string, name: string, args: string) => {
          toolCalls.push({ id, name, arguments: args });
          onEvent({ type: "tool_call_pending", taskId: input.taskId, toolCallId: id, name });
        },
        onUsage: (usage) => {
          turnUsage = usage;
        },
        onDone: () => {
          if (toolCalls.length > 0) {
            // Emit tool started events
            for (const call of toolCalls) {
              let parsedInput: unknown;
              try {
                parsedInput = call.arguments.trim() ? JSON.parse(call.arguments) : {};
              } catch {
                parsedInput = {};
              }
              onEvent({
                type: "tool_call_started",
                taskId: input.taskId,
                toolCallId: call.id,
                name: call.name,
                input: parsedInput,
              });
            }
          }
          resolve({ toolCalls, content, reasoningContent, usage: turnUsage });
        },
        onError: (error: Error) => {
          reject(error);
        },
      },
    );
  });
}

// ---------------------------------------------------------------------------
// Tool result appending
// ---------------------------------------------------------------------------

async function appendToolResults(
  messages: AgentChatMessage[],
  turn: AgentTurnResult,
  context: ToolExecutionContext,
  onEvent: AgentEventHandler,
): Promise<AgentChatMessage[]> {
  // Build assistant message with tool calls
  const assistantMessage: AgentChatMessage = {
    role: "assistant",
    content: turn.content || undefined,
    reasoning_content: turn.reasoningContent || undefined,
    tool_calls: turn.toolCalls.map((tc) => ({
      id: tc.id,
      type: "function" as const,
      function: { name: tc.name, arguments: tc.arguments },
    })),
  };

  const nextMessages = [...messages, assistantMessage];

  // Execute all tools in parallel
  const results = await Promise.all(
    turn.toolCalls.map(async (call) => {
      try {
        const result = await executeToolCall(call.name, call.arguments, context);
        // Emit tool finished event
        if (result.ok) {
          onEvent({
            type: "tool_call_finished",
            taskId: context.taskId ?? "",
            toolCallId: call.id,
            output: result.data,
          });
        } else {
          onEvent({
            type: "tool_call_finished",
            taskId: context.taskId ?? "",
            toolCallId: call.id,
            errorText: result.error?.message,
          });
        }
        return { id: call.id, result };
      } catch (error) {
        const errorText = error instanceof Error ? error.message : String(error);
        onEvent({
          type: "tool_call_finished",
          taskId: context.taskId ?? "",
          toolCallId: call.id,
          errorText,
        });
        return {
          id: call.id,
          result: {
            ok: false,
            tool: call.name,
            error: { code: "execution_error", message: errorText },
          },
        };
      }
    }),
  );

  // Add tool result messages
  for (const { id, result } of results) {
    const content = result.ok
      ? JSON.stringify(result.data, null, 2)
      : JSON.stringify({ error: result.error }, null, 2);

    nextMessages.push({
      role: "tool",
      tool_call_id: id,
      content,
    });
  }

  return nextMessages;
}
