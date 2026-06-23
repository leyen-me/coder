import { headlessStartAgentTask } from "@/features/agent/headless-runner";
import { getExternalSendMessage } from "@/features/agent/store/agent-store";
import { buildAgentMessages } from "@/features/agent/build-agent-messages";
import { resolveAgentEnvironment } from "@/features/agent/environment/resolve-environment";
import { SEND_EMAIL_TOOL } from "@/features/agent/tools";
import type { AgentChatMessage, AgentEvent } from "@/features/agent/types";
import { appEventBus } from "@/lib/event-bus";
import { resolveProviderConfig } from "@/lib/model-provider/resolve-provider-config";
import { readModelProviderSettings } from "@/lib/model-provider/storage";
import {
  createMessage,
  createMessageId,
  createSession,
  deriveSessionTitle,
  finishAutomationRun,
  getMessagesBySession,
  startAutomationRun,
} from "@/lib/db";
import type { AutomationRunStatus } from "@/lib/db";

import type { AutomationRecord } from "@/lib/db";
import { inferAutomationRunStatus } from "@/lib/db/automation-runs";

import {
  releaseAutomationRunLock,
  tryAcquireAutomationRunLock,
} from "./automation-run-lock";
import { resolveAutomationRunConfig } from "./run-config";

async function completeAutomationRun(
  automationId: string,
  sessionId: string,
  summary: string,
  status?: AutomationRunStatus,
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
  automation: AutomationRecord,
): Promise<void> {
  const sessionId = createMessageId();

  try {
    const modelSettings = readModelProviderSettings();
    const resolved = resolveProviderConfig(modelSettings, automation.provider);
    const runConfig = resolveAutomationRunConfig(automation, resolved);

    const session = await createSession({
      id: sessionId,
      title: deriveSessionTitle(automation.prompt),
      model: runConfig.model,
      provider: runConfig.provider,
      workspaceDir: runConfig.workspaceDir,
    });

    await startAutomationRun(automation.id, session.id);

    // Prefer routing through the agent store for full streaming / task state.
    // Fall back to headless runner if the store is not mounted.
    const sendMessage = getExternalSendMessage();
    if (sendMessage) {
      await storeExecuteAutomation(automation, session, runConfig, sendMessage);
    } else {
      await headlessExecuteAutomation(automation, session, runConfig, resolved);
    }
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    console.error(`[automation] ${automation.name} failed:`, message);

    await completeAutomationRun(
      automation.id,
      sessionId,
      `[failed] ${message.slice(0, 200)}`,
      "failed",
    );
  }
}

// ── Store-backed execution (streaming, task state, sidebar spinner) ──

async function storeExecuteAutomation(
  automation: AutomationRecord,
  session: Awaited<ReturnType<typeof createSession>>,
  runConfig: Awaited<ReturnType<typeof resolveAutomationRunConfig>>,
  sendMessage: NonNullable<ReturnType<typeof getExternalSendMessage>>,
): Promise<void> {
  const { taskId } = await sendMessage({
    sessionId: session.id,
    content: automation.prompt,
    model: runConfig.model,
    agentMode: runConfig.agentMode,
    extraTools: automation.enableEmail ? [SEND_EMAIL_TOOL] : undefined,
  });

  // Wait for task completion via event bus — the agent store emits
  // agent:task_completed when the task reaches a terminal status.
  const status = await new Promise<"completed" | "failed" | "cancelled">(
    (resolve) => {
      const unsub = appEventBus.on("agent:task_completed", (event) => {
        if (event.taskId === taskId) {
          unsub();
          resolve(event.status);
        }
      });
    },
  );

  // Read the assistant content from DB for the run summary
  const messages = await getMessagesBySession(session.id);
  const assistantMsg = [...messages]
    .reverse()
    .find((m): m is typeof m & { role: "assistant" } => m.role === "assistant" && m.taskId === taskId);
  const content = assistantMsg?.content ?? "";
  const summary = content
    ? content.slice(0, 200).replace(/\n/g, " ")
    : `[${status}]`;

  await completeAutomationRun(automation.id, session.id, summary, status);
}

// ── Headless fallback (store not mounted) ──────────────────────────

async function headlessExecuteAutomation(
  automation: AutomationRecord,
  session: Awaited<ReturnType<typeof createSession>>,
  runConfig: Awaited<ReturnType<typeof resolveAutomationRunConfig>>,
  resolved: ReturnType<typeof resolveProviderConfig>,
): Promise<void> {
  const environment = await resolveAgentEnvironment(runConfig.workspaceDir);
  const userMessageId = createMessageId();

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

  const agentMessages: AgentChatMessage[] = [
    { role: "user", content: automation.prompt },
  ];
  const messages = await buildAgentMessages(
    agentMessages,
    environment,
    runConfig.agentMode,
    session.id,
  );

  const extraTools = automation.enableEmail ? [SEND_EMAIL_TOOL] : undefined;

  let assistantContent = "";
  let finalStatus: "completed" | "failed" | "cancelled" = "completed";

  await headlessStartAgentTask({
    sessionId: session.id,
    model: runConfig.model,
    resolvedConfig: resolved,
    messages,
    workspaceDir: runConfig.workspaceDir,
    agentMode: runConfig.agentMode,
    extraTools,
    thinkingEnabled: runConfig.thinkingEnabled,
    onEvent: (event: AgentEvent) => {
      if (event.type === "content_delta") {
        assistantContent += event.delta;
      }
      if (event.type === "status") {
        if (
          event.status === "completed" ||
          event.status === "failed" ||
          event.status === "cancelled"
        ) {
          finalStatus = event.status;
        }
      }
      if (event.type === "error") {
        finalStatus = "failed";
      }
    },
  });

  const summary = assistantContent
    ? assistantContent.slice(0, 200).replace(/\n/g, " ")
    : `[${finalStatus}]`;

  await completeAutomationRun(
    automation.id,
    session.id,
    summary,
    finalStatus === "completed" ? "completed" : finalStatus,
  );
}

export async function runAutomation(
  automation: AutomationRecord,
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
export function queueAutomationRun(
  automation: AutomationRecord,
): RunAutomationResult {
  if (!tryAcquireAutomationRunLock(automation.id)) {
    return "already_running";
  }

  void executeAutomation(automation).finally(() => {
    releaseAutomationRunLock(automation.id);
  });

  return "started";
}

export async function runAutomationById(
  id: string,
): Promise<RunAutomationByIdResult> {
  const { getAutomation } = await import("@/lib/db/automations");
  const automation = await getAutomation(id);
  if (!automation) {
    return "not_found";
  }

  return queueAutomationRun(automation);
}
