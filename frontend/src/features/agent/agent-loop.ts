import {
  executeToolCall,
  getAgentToolDefinitions,
  serializeToolResult,
} from "./tools";
import type { ToolResultEnvelope } from "./tools/result";
import { AgentCancellationError, isAgentCancellationError, throwIfAborted } from "./cancellation";
import { parseToolCallInput, toolResultToInvocationPatch } from "./tools/tool-display";
import { toApiToolCalls } from "./tools/api-tool-call";
import type { AgentToolCall, TavilyConfig } from "./tools/types";
import type { ModelDefinition } from "@/lib/model-provider/types";
import { startAgent } from "./runner";
import type { AgentChatMessage, AgentEvent, AgentEventHandler, AgentMode, AgentStartInput, TokenUsage } from "./types";
import {
  AgentChatTurnError,
  buildStreamIdleRecoveryMessages,
  CHAT_RETRY_MAX_ATTEMPTS,
  chatRetryDelayMs,
  isCommittedStreamOutputEvent,
  isRetriableChatError,
  isStreamIdleTimeoutError,
  sleep,
} from "./chat-retry";
import {
  ToolCallStallDetector,
  agentToolCallStallError,
} from "./tool-call-stall";
import { shouldTriggerContextHandoff } from "./context-monitor";
import {
  buildFinalAnswerDecisionRequest,
} from "./decision/policy";
import { requestProxyDecision } from "./decision/runner";
import { isLongTaskSession } from "./session-policy";
import type { DecisionResponse } from "@/lib/decision";

type ToolExecutionContextInput = {
  workspaceDir: string | null;
  sessionId: string;
  taskId: string;
  signal?: AbortSignal;
  tavilyConfig?: TavilyConfig | null;
  allowPrivateNetworkAccess?: boolean;
  agentMode?: AgentMode;
  spawnSubAgentConfig?: {
    baseUrl: string;
    apiKey: string;
    apiKeySource: "manual" | "env";
    apiKeyEnvVar: string;
    model: string;
    models: readonly ModelDefinition[];
    thinkingEnabled?: boolean;
  };
  emitProgress?: (partialOutput: unknown) => void;
};

export async function runAgentWithTools(
  input: AgentStartInput,
  context: ToolExecutionContextInput,
  onEvent: AgentEventHandler
): Promise<void> {
  let messages = [...input.messages];
  const tools = input.tools ?? getAgentToolDefinitions(input.agentMode);
  const explicitlyAllowedToolNames: ReadonlySet<string> | undefined =
    input.tools
      ? new Set(tools.map((t) => t.function.name))
      : undefined;
  const stallDetector = new ToolCallStallDetector();

  // Accumulate token usage across all turns in a multi-turn agent loop.
  let cumulativeUsage: TokenUsage | undefined;

  // Build spawnSubAgentConfig from input if not already provided,
  // so the spawn_subagent tool can reuse the parent's provider config.
  const toolContext: ToolExecutionContextInput = context.spawnSubAgentConfig
    ? context
    : {
        ...context,
        spawnSubAgentConfig: {
          baseUrl: input.baseUrl,
          apiKey: input.apiKey,
          apiKeySource: input.apiKeySource,
          apiKeyEnvVar: input.apiKeyEnvVar,
          model: input.model,
          models: input.models ?? ([] as readonly ModelDefinition[]),
        },
      };

  while (true) {
    throwIfAborted(context.signal, input.taskId);

    const handoffUsage = shouldTriggerContextHandoff({
      messages,
      maxTokens: input.maxContextTokens,
      triggerThreshold: input.handoffTriggerThreshold,
    });
    if (handoffUsage) {
      onEvent({
        type: "handoff_required",
        taskId: input.taskId,
        contextUsage: handoffUsage,
      });
      onEvent({ type: "done", taskId: input.taskId });
      onEvent({ type: "status", taskId: input.taskId, status: "completed" });
      return;
    }

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

    // Accumulate token usage across turns so multi-turn agent runs
    // (e.g., tool calls → results → follow-up) record the full cost.
    if (turn.usage) {
      cumulativeUsage = cumulativeUsage
        ? {
            promptTokens: cumulativeUsage.promptTokens + turn.usage.promptTokens,
            completionTokens: cumulativeUsage.completionTokens + turn.usage.completionTokens,
            totalTokens: cumulativeUsage.totalTokens + turn.usage.totalTokens,
          }
        : turn.usage;
    }

    if (turn.toolCalls.length === 0) {
      if (
        isLongTaskSession({
          sessionKind: input.sessionKind ?? "standard",
          autonomyMode: input.autonomyMode ?? "interactive",
        })
      ) {
        const assistantMessage = buildAssistantMessageFromTurn(turn);
        const decisionRequest = buildFinalAnswerDecisionRequest({
          sessionId: context.sessionId,
          taskId: input.taskId,
          assistantResponse: turn.content,
          sessionKind: input.sessionKind ?? "standard",
          autonomyMode: input.autonomyMode ?? "interactive",
          decisionPolicyVersion:
            input.decisionPolicyVersion?.trim() || "mvp-v1",
        });

        const decisionId = crypto.randomUUID();
        onEvent({
          type: "decision_requested",
          taskId: input.taskId,
          decisionId,
          trigger: decisionRequest.trigger,
          summary: decisionRequest.summary,
          question: decisionRequest.question,
          options: decisionRequest.options,
          riskLevel: "medium",
          requiresUserConfirmation: false,
        });

        let decisionResponse: DecisionResponse;
        try {
          decisionResponse = await requestProxyDecision({
            taskId: input.taskId,
            model: input.decisionModel?.trim() || input.model,
            baseUrl: input.baseUrl,
            apiKey: input.apiKey,
            apiKeySource: input.apiKeySource,
            apiKeyEnvVar: input.apiKeyEnvVar,
            request: decisionRequest,
            conversationMessages: messages,
            signal: context.signal,
          });
        } catch (error) {
          decisionResponse = {
            outcome: "complete",
            selectedOptionId: "complete",
            reason:
              error instanceof Error
                ? `Proxy decision failed, so the task was finalized with the current assistant answer: ${error.message}`
                : "Proxy decision failed, so the task was finalized with the current assistant answer.",
            riskLevel: "medium",
            recordAsAssumption: false,
            requiresUserConfirmation: false,
            assumption: null,
            suggestedContinuation: null,
          };
        }

        onEvent({
          type: "decision_resolved",
          taskId: input.taskId,
          decisionId,
          trigger: decisionRequest.trigger,
          summary: decisionRequest.summary,
          question: decisionRequest.question,
          options: decisionRequest.options,
          response: decisionResponse,
        });

        if (decisionResponse.outcome === "continue") {
          messages = [
            ...messages,
            assistantMessage,
            buildProxyContinuationUserMessage(decisionResponse),
          ];
          continue;
        }
      }

      onEvent({ type: "done", taskId: input.taskId, usage: cumulativeUsage ?? turn.usage });
      onEvent({ type: "status", taskId: input.taskId, status: "completed" });
      return;
    }

    if (stallDetector.record(turn.toolCalls)) {
      throw agentToolCallStallError();
    }

    messages = await appendToolResults(messages, turn, toolContext, onEvent, explicitlyAllowedToolNames);
  }
}

type AgentTurnResult = {
  toolCalls: AgentToolCall[];
  content: string;
  reasoningContent: string;
  /** Actual token usage from the provider's API response, if available. */
  usage?: TokenUsage;
};

async function runSingleAgentTurn(
  input: AgentStartInput,
  signal: AbortSignal | undefined,
  onEvent: AgentEventHandler
): Promise<AgentTurnResult> {
  let turnMessages = [...input.messages];
  let lastError: unknown;

  for (let attempt = 1; attempt <= CHAT_RETRY_MAX_ATTEMPTS; attempt++) {
    throwIfAborted(signal, input.taskId);

    try {
      return await runSingleAgentTurnAttempt(
        { ...input, messages: turnMessages },
        signal,
        onEvent
      );
    } catch (error) {
      if (!(error instanceof AgentChatTurnError)) {
        throw error;
      }

      lastError = error;

      const canRecoverFromIdleTimeout =
        isStreamIdleTimeoutError(error.message) &&
        attempt < CHAT_RETRY_MAX_ATTEMPTS;

      if (canRecoverFromIdleTimeout) {
        turnMessages = buildStreamIdleRecoveryMessages(
          turnMessages,
          error.partialTurn
        );
        onEvent({
          type: "chat_retry",
          taskId: input.taskId,
          attempt: attempt + 1,
          maxAttempts: CHAT_RETRY_MAX_ATTEMPTS,
        });
        await sleep(chatRetryDelayMs(attempt), signal);
        continue;
      }

      const canGenericRetry =
        attempt < CHAT_RETRY_MAX_ATTEMPTS &&
        !error.hadStreamOutput &&
        isRetriableChatError(error);

      if (canGenericRetry) {
        onEvent({
          type: "chat_retry",
          taskId: input.taskId,
          attempt: attempt + 1,
          maxAttempts: CHAT_RETRY_MAX_ATTEMPTS,
        });
        await sleep(chatRetryDelayMs(attempt), signal);
        continue;
      }

      if (error.hadStreamOutput) {
        onEvent({
          type: "error",
          taskId: input.taskId,
          message: error.message,
        });
      }

      throw error;
    }
  }

  throw lastError;
}

async function runSingleAgentTurnAttempt(
  input: AgentStartInput,
  signal: AbortSignal | undefined,
  onEvent: AgentEventHandler
): Promise<AgentTurnResult> {
  return new Promise<AgentTurnResult>((resolve, reject) => {
    let toolCalls: AgentToolCall[] = [];
    let content = "";
    let reasoningContent = "";
    let turnUsage: TokenUsage | undefined;
    let pendingToolName: string | undefined;
    let hadStreamOutput = false;
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

    const failTurn = (message: string) => {
      finish(() =>
        reject(
          new AgentChatTurnError(message, hadStreamOutput, {
            content,
            reasoningContent,
            pendingToolName,
          })
        )
      );
    };

    const markStreamOutput = () => {
      hadStreamOutput = true;
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
      if (isCommittedStreamOutputEvent(event)) {
        markStreamOutput();
      }

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

      if (event.type === "tool_call_pending") {
        pendingToolName = event.name;
        onEvent(event);
        return;
      }

      if (event.type === "turn_complete") {
        toolCalls = event.toolCalls;
        return;
      }

      // "done" from the runner carries token usage; capture it for the turn result.
      if (event.type === "done") {
        turnUsage = event.usage;
        return;
      }

      if (event.type === "status") {
        if (event.status === "completed") {
          finish(() => resolve({ toolCalls, content, reasoningContent, usage: turnUsage }));
          return;
        }

        if (event.status === "failed" || event.status === "cancelled") {
          failTurn(`Agent turn ended with status: ${event.status}`);
          return;
        }
      }

      if (event.type === "error") {
        failTurn(event.message);
        return;
      }

      onEvent(event);
    }, {
      signal,
    }).catch((error: unknown) => {
      const message = error instanceof Error ? error.message : String(error);
      failTurn(message);
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
  onEvent: AgentEventHandler,
  explicitlyAllowedToolNames: ReadonlySet<string> | undefined,
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

  // 1. Emit all tool_call_started events synchronously so the UI sees
  //    every tool immediately, even when they execute in parallel.
  for (const call of turn.toolCalls) {
    throwIfAborted(context.signal, context.taskId);
    const toolInput = parseToolCallInput(call.arguments);
    onEvent({
      type: "tool_call_started",
      taskId: context.taskId ?? "",
      toolCallId: call.id,
      name: call.name,
      input: toolInput,
    });
  }

  // 2. Execute all tools in parallel.
  //    Wrap each in a safe promise so Promise.all always resolves.
  //    Errors are collected and the first error is re-thrown after
  //    every tool settles, ensuring proper cleanup of cancellation events.
  type SafeResult =
    | { kind: "ok"; result: ToolResultEnvelope }
    | { kind: "cancelled" }
    | { kind: "fail"; error: unknown };

  const results: SafeResult[] = await Promise.all(
    turn.toolCalls.map(async (call) => {
      try {
        const result = await executeToolCall(call.name, call.arguments, {
          workspaceDir: context.workspaceDir,
          sessionId: context.sessionId,
          taskId: context.taskId,
          signal: context.signal,
          tavilyConfig: context.tavilyConfig,
          allowPrivateNetworkAccess: context.allowPrivateNetworkAccess,
          agentMode: context.agentMode,
          explicitlyAllowedToolNames,
          spawnSubAgentConfig: context.spawnSubAgentConfig,
          // Provide a progress callback that lets tools push partial output
          // to the UI in real-time by re-emitting a finished event with
          // the latest data.
          emitProgress: context.emitProgress ?? ((partial) => {
            // Use toolSuccess to wrap partial data in a result envelope
            onEvent({
              type: "tool_call_finished",
              taskId: context.taskId ?? "",
              toolCallId: call.id,
              output: { ok: true, tool: call.name, data: partial },
            });
          }),
        });
        return { kind: "ok", result };
      } catch (error) {
        if (isAgentCancellationError(error)) {
          return { kind: "cancelled" };
        }
        return { kind: "fail", error };
      }
    })
  );

  // 3. Process results in order — emit finished events and build message list.
  let firstError: unknown;
  for (let i = 0; i < turn.toolCalls.length; i++) {
    const call = turn.toolCalls[i];
    const safe = results[i];

    if (safe.kind === "cancelled") {
      onEvent({
        type: "tool_call_finished",
        taskId: context.taskId ?? "",
        toolCallId: call.id,
        errorText: "Cancelled",
      });
      firstError ??= new AgentCancellationError(context.taskId);
      continue;
    }

    if (safe.kind === "fail") {
      // Non-cancellation error — skip finished event (matches original behavior).
      firstError ??= safe.error;
      continue;
    }

    const patch = toolResultToInvocationPatch(safe.result);
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
      content: serializeToolResult(safe.result),
    });
  }

  // 4. If any tool failed, propagate the first error.
  if (firstError) {
    throw firstError;
  }

  return nextMessages;
}

function buildAssistantMessageFromTurn(turn: {
  toolCalls: AgentToolCall[];
  content: string;
  reasoningContent: string;
}): AgentChatMessage {
  const message: AgentChatMessage = { role: "assistant" };
  if (turn.content.trim()) {
    message.content = turn.content;
  }
  if (turn.reasoningContent.trim()) {
    message.reasoning_content = turn.reasoningContent;
  }
  if (turn.toolCalls.length > 0) {
    message.tool_calls = toApiToolCalls(turn.toolCalls);
  }
  return message;
}

function buildProxyContinuationUserMessage(
  response: DecisionResponse
): AgentChatMessage {
  return {
    role: "user",
    content:
      response.suggestedContinuation?.trim() ||
      "继续，任务还没有完成。请基于当前上下文自行推进，直到真正完成为止。",
  };
}

