import { runAgentWithTools } from "@/features/agent/agent-loop";
import { buildAgentMessages } from "@/features/agent/build-agent-messages";
import { resolveAgentEnvironment } from "@/features/agent/environment/resolve-environment";
import { resolveApiKey, resolveApiKeyEnvVar } from "@/features/agent/model-preference";
import { buildThinkingRequestExtensions } from "@/features/agent/thinking-preference";
import {
  DEFAULT_MODEL_CONTEXT_WINDOW,
  findModelDefinition,
} from "@/lib/model-provider/model-definition";
import { resolveProviderConfig } from "@/lib/model-provider/resolve-provider-config";
import { readModelProviderSettings } from "@/lib/model-provider/storage";
import { readWebToolsSettings } from "@/lib/web-tools/storage";
import { resolveTavilyConfig } from "@/lib/web-tools/resolve-tavily-config";
import {
  createSession,
  createMessage,
  updateMessage,
  createTaskId,
  createMessageId,
  startAutomationRun,
  finishAutomationRun,
  deriveSessionTitle,
} from "@/lib/db";
import type { AutomationRunStatus } from "@/lib/db";

import type { AutomationRecord } from "@/lib/db";
import type { AgentChatMessage, AgentEvent } from "@/features/agent/types";

import {
  releaseAutomationRunLock,
  tryAcquireAutomationRunLock,
} from "./automation-run-lock";
import { inferAutomationRunStatus } from "@/lib/db/automation-runs";
import { resolveAutomationRunConfig } from "./run-config";

async function completeAutomationRun(
  automationId: string,
  sessionId: string,
  summary: string,
  status?: AutomationRunStatus
): Promise<void> {
  await finishAutomationRun(automationId, sessionId, {
    summary,
    status: status ?? inferAutomationRunStatus(summary),
  });
}

export type RunAutomationResult = "started" | "already_running";
export type RunAutomationByIdResult = RunAutomationResult | "not_found";

/** Execute an automation: create session, run agent, store results. */
export async function executeAutomation(
  automation: AutomationRecord
): Promise<void> {
  const taskId = createTaskId();
  const sessionId = createMessageId();
  const assistantMessageId = createMessageId();
  const userMessageId = createMessageId();

  try {
    const modelSettings = readModelProviderSettings();
    const resolved = resolveProviderConfig(modelSettings);
    const runConfig = resolveAutomationRunConfig(automation, resolved);
    const apiKey = resolveApiKey(resolved);
    const apiKeySource = resolved.apiKeySource;
    const apiKeyEnvVar = resolveApiKeyEnvVar(resolved);
    const webToolsSettings = readWebToolsSettings();
    const tavilyConfig = resolveTavilyConfig(webToolsSettings);
    const environment = await resolveAgentEnvironment(runConfig.workspaceDir);

    const title = deriveSessionTitle(automation.prompt);
    const session = await createSession({
      id: sessionId,
      title,
      model: runConfig.model,
      workspaceDir: runConfig.workspaceDir,
    });

    await startAutomationRun(automation.id, session.id);

    await createMessage({
      id: userMessageId,
      sessionId: session.id,
      role: "user",
      content: automation.prompt,
      thinking: "",
      toolInvocations: [],
      status: "completed",
      taskId: null,
      error: null,
    });

    await createMessage({
      id: assistantMessageId,
      sessionId: session.id,
      role: "assistant",
      content: "",
      thinking: "",
      toolInvocations: [],
      status: "pending",
      taskId,
      error: null,
    });

    const agentMessages: AgentChatMessage[] = [
      { role: "user", content: automation.prompt },
    ];

    const messages = await buildAgentMessages(
      agentMessages,
      environment,
      runConfig.agentMode
    );

    const abortController = new AbortController();

    await runAgentWithTools(
      {
        taskId,
        baseUrl: resolved.baseUrl,
        apiKey,
        apiKeySource,
        apiKeyEnvVar,
        model: runConfig.model,
        messages,
        requestExtensions: buildThinkingRequestExtensions({
          models: resolved.models,
          modelId: runConfig.model,
          thinkingEnabled: runConfig.thinkingEnabled,
        }),
        maxContextTokens:
          findModelDefinition(resolved.models, runConfig.model)?.contextWindow ??
          DEFAULT_MODEL_CONTEXT_WINDOW,
        agentMode: runConfig.agentMode,
      },
      {
        workspaceDir: runConfig.workspaceDir,
        taskId,
        signal: abortController.signal,
        tavilyConfig,
        allowPrivateNetworkAccess: webToolsSettings.allowPrivateNetworkAccess,
      },
      (event: AgentEvent) => {
        if (event.type === "content_delta") {
          void updateMessage(
            assistantMessageId,
            { content: event.delta },
            { silent: true, touch: false }
          );
        } else if (event.type === "thinking_delta") {
          void updateMessage(
            assistantMessageId,
            { thinking: event.delta },
            { silent: true, touch: false }
          );
        }

        if (event.type === "status") {
          if (
            event.status === "completed" ||
            event.status === "failed" ||
            event.status === "cancelled"
          ) {
            void updateMessage(assistantMessageId, {
              status: event.status,
              error: event.status === "completed" ? null : event.status,
            });

            void (async () => {
              const assistant = await import("@/lib/db/messages").then((m) =>
                m.getMessage(assistantMessageId)
              );
              const summary = assistant?.content
                ? assistant.content.slice(0, 200).replace(/\n/g, " ")
                : `[${event.status}]`;
              const terminalStatus =
                event.status as Extract<
                  AutomationRunStatus,
                  "completed" | "failed" | "cancelled"
                >;
              await completeAutomationRun(
                automation.id,
                session.id,
                summary,
                terminalStatus
              );
            })();
          }
        }

        if (event.type === "error") {
          void updateMessage(assistantMessageId, {
            status: "failed",
            error: event.message,
          });

          void completeAutomationRun(
            automation.id,
            session.id,
            `[error] ${event.message.slice(0, 200)}`,
            "failed"
          );
        }
      }
    );
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    console.error(`[automation] ${automation.name} failed:`, message);

    await completeAutomationRun(
      automation.id,
      sessionId,
      `[failed] ${message.slice(0, 200)}`,
      "failed"
    );

    try {
      await updateMessage(assistantMessageId, {
        status: "failed",
        error: message,
      });
    } catch {
      // Message may not exist yet.
    }
  }
}

export async function runAutomation(
  automation: AutomationRecord
): Promise<RunAutomationResult> {
  if (!tryAcquireAutomationRunLock(automation.id)) {
    return "already_running";
  }

  try {
    await executeAutomation(automation);
    return "started";
  } finally {
    releaseAutomationRunLock(automation.id);
  }
}

/** Fire-and-forget wrapper used by the scheduler and manual run button. */
export function queueAutomationRun(automation: AutomationRecord): RunAutomationResult {
  if (!tryAcquireAutomationRunLock(automation.id)) {
    return "already_running";
  }

  void executeAutomation(automation).finally(() => {
    releaseAutomationRunLock(automation.id);
  });

  return "started";
}

export async function runAutomationById(
  id: string
): Promise<RunAutomationByIdResult> {
  const { getAutomation } = await import("@/lib/db/automations");
  const automation = await getAutomation(id);
  if (!automation) {
    return "not_found";
  }

  return queueAutomationRun(automation);
}
