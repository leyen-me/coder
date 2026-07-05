import { generateId } from "@/lib/generate-id";
import {
  createMessage,
  createTaskId,
  updateMessage,
} from "@/lib/db";
import type { SessionAutonomyMode, SessionKind } from "@/lib/db";
import {
  DEFAULT_MODEL_CONTEXT_WINDOW,
  findModelDefinition,
} from "@/lib/model-provider/model-definition";
import type { ResolvedProviderConfig } from "@/lib/model-provider/types";

import { runAgentWithTools } from "./agent-loop";
import { isAgentCancellationError } from "./cancellation";
import { resolveApiKey, resolveApiKeyEnvVar } from "./model-preference";
import { buildThinkingRequestExtensions } from "./thinking-preference";
import { getAgentToolDefinitions } from "./tools";
import type { AgentToolDefinition } from "./tools/types";
import type { AgentChatMessage, AgentEvent, AgentMode } from "./types";

/**
 * Shared helper moved here so both agent-store and automations
 * can resolve the context window without React dependency.
 */
export function resolveContextWindowForModel(
  resolved: ResolvedProviderConfig,
  modelId: string,
): number {
  return (
    findModelDefinition(resolved.models, modelId)?.contextWindow ??
    DEFAULT_MODEL_CONTEXT_WINDOW
  );
}

export type HeadlessAgentTaskInput = {
  sessionId: string;
  model: string;
  resolvedConfig: ResolvedProviderConfig;
  messages: readonly AgentChatMessage[];
  workspaceDir: string | null;
  agentMode?: AgentMode;
  sessionKind?: SessionKind;
  autonomyMode?: SessionAutonomyMode;
  decisionPolicyVersion?: string;
  decisionModel?: string | null;
  signal?: AbortSignal;
  /** Optional extra tools (e.g. SEND_EMAIL_TOOL for automations). */
  extraTools?: AgentToolDefinition[];
  thinkingEnabled?: boolean;
  /**
   * Called for every AgentEvent during execution.
   * The default handler still runs (persisting content/thinking/status).
   * Use this to observe terminal status for automation run tracking, etc.
   */
  onEvent?: (event: AgentEvent) => void;
};

export type HeadlessAgentTaskResult = {
  taskId: string;
  assistantMessageId: string;
};

/**
 * Headless agent task launcher.
 *
 * Creates an assistant message then runs `runAgentWithTools`. Handles
 * basic event streaming (content/thinking persistence) and terminal
 * status (marks message completed / failed / cancelled).
 *
 * Designed to be shared between:
 * - `agent-store.tsx` — wraps it with task state mgmt + streaming buffer
 * - `run-automation.ts` — wraps it with automation run tracking
 *
 * Does NOT depend on React context. Callers own:
 * - Session creation / user message creation
 * - Provider config resolution
 * - Agent message building from history
 * - Automation run tracking (if applicable)
 */
export async function headlessStartAgentTask(
  input: HeadlessAgentTaskInput,
): Promise<HeadlessAgentTaskResult> {
  const taskId = createTaskId();
  const assistantMessageId = generateId();

  await createMessage({
    id: assistantMessageId,
    sessionId: input.sessionId,
    role: "assistant",
    messageKind: input.agentMode === "plan" ? "plan" : undefined,
    content: "",
    thinking: "",
    processSteps: [],
    toolInvocations: [],
    status: "pending",
    taskId,
    error: null,
  });

  const abortController = new AbortController();
  const signal = input.signal ?? abortController.signal;

  const tools = input.extraTools
    ? [...getAgentToolDefinitions(input.agentMode), ...input.extraTools]
    : undefined;

  let assistantContent = "";
  let assistantThinking = "";

  await runAgentWithTools(
    {
      taskId,
      baseUrl: input.resolvedConfig.baseUrl,
      apiKey: resolveApiKey(input.resolvedConfig),
      apiKeySource: input.resolvedConfig.apiKeySource,
      apiKeyEnvVar: resolveApiKeyEnvVar(input.resolvedConfig),
      model: input.model,
      models: input.resolvedConfig.models,
      messages: [...input.messages],
      tools,
      requestExtensions: buildThinkingRequestExtensions({
        models: input.resolvedConfig.models,
        modelId: input.model,
        thinkingEnabled: input.thinkingEnabled ?? false,
      }),
      maxContextTokens: resolveContextWindowForModel(
        input.resolvedConfig,
        input.model,
      ),
      agentMode: input.agentMode,
      sessionKind: input.sessionKind,
      autonomyMode: input.autonomyMode,
      decisionPolicyVersion: input.decisionPolicyVersion,
      decisionModel: input.decisionModel,
    },
    {
      workspaceDir: input.workspaceDir,
      sessionId: input.sessionId,
      taskId,
      signal,
      agentMode: input.agentMode,
    },
    (event: AgentEvent) => {
      // Let caller observe every event (e.g. for automation run tracking)
      input.onEvent?.(event);

      switch (event.type) {
        case "content_delta":
          assistantContent += event.delta;
          void updateMessage(
            assistantMessageId,
            { content: assistantContent },
            { silent: true, touch: false },
          );
          break;

        case "thinking_delta":
          assistantThinking += event.delta;
          void updateMessage(
            assistantMessageId,
            { thinking: assistantThinking },
            { silent: true, touch: false },
          );
          break;

        case "status":
          if (isTerminalAgentStatus(event.status)) {
            void persistTerminalStatus(
              assistantMessageId,
              event.status,
              assistantContent,
              assistantThinking,
              null,
            );
          }
          break;

        case "error":
          void persistTerminalStatus(
            assistantMessageId,
            "failed",
            assistantContent,
            assistantThinking,
            event.message,
          );
          break;
      }
    },
  ).catch((error: unknown) => {
    if (signal.aborted || isAgentCancellationError(error)) {
      void persistTerminalStatus(
        assistantMessageId,
        "cancelled",
        assistantContent,
        assistantThinking,
        null,
      );
      return;
    }

    const message = error instanceof Error ? error.message : String(error);
    void persistTerminalStatus(
      assistantMessageId,
      "failed",
      assistantContent,
      assistantThinking,
      message,
    );
  });

  return { taskId, assistantMessageId };
}

// ---- internal helpers ----

type AgentTerminalStatus = "completed" | "failed" | "cancelled";

function isTerminalAgentStatus(
  status: string,
): status is AgentTerminalStatus {
  return status === "completed" || status === "failed" || status === "cancelled";
}

function agentTerminalMessageStatus(
  status: AgentTerminalStatus,
): "completed" | "failed" | "cancelled" {
  // Both failed and cancelled map 1:1; completed stays completed.
  return status;
}

async function persistTerminalStatus(
  messageId: string,
  status: AgentTerminalStatus,
  content: string,
  thinking: string,
  error: string | null,
): Promise<void> {
  await updateMessage(
    messageId,
    {
      status: agentTerminalMessageStatus(status),
      content,
      thinking,
      error,
    },
    { silent: true, touch: false },
  );
}
