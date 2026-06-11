import { CronExpressionParser } from "cron-parser";

import { runAgentWithTools } from "@/features/agent/agent-loop";
import { buildAgentMessages } from "@/features/agent/build-agent-messages";
import { resolveAgentEnvironment } from "@/features/agent/environment/resolve-environment";
import { resolveDefaultModel, resolveApiKey, resolveApiKeyEnvVar } from "@/features/agent/model-preference";
import { buildThinkingRequestExtensions } from "@/features/agent/thinking-preference";
import { resolveProviderConfig } from "@/lib/model-provider/resolve-provider-config";
import { readModelProviderSettings } from "@/lib/model-provider/storage";
import {
  createSession,
  createMessage,
  updateMessage,
  createTaskId,
  createMessageId,
  markAutomationRun,
  deriveSessionTitle,
} from "@/lib/db";

import type { AutomationRecord } from "@/lib/db";
import type { AgentChatMessage, AgentEvent } from "@/features/agent/types";

/** How often the scheduler checks for due automations (ms). */
export const SCHEDULER_INTERVAL_MS = 30_000;

let schedulerTimerId: ReturnType<typeof setInterval> | null = null;
let runningAutomations = new Set<string>();

/** Start the scheduler — called once when the app mounts. */
export function startAutomationScheduler(): void {
  if (schedulerTimerId !== null) {
    return;
  }

  // Fire once immediately on start, then poll.
  void tick();
  schedulerTimerId = setInterval(tick, SCHEDULER_INTERVAL_MS);
}

/** Stop the scheduler — called when the app unmounts. */
export function stopAutomationScheduler(): void {
  if (schedulerTimerId !== null) {
    clearInterval(schedulerTimerId);
    schedulerTimerId = null;
  }
}

/** Check for due automations and execute them. */
async function tick(): Promise<void> {
  try {
    const { listEnabledAutomations } = await import("@/lib/db/automations");
    const automations = await listEnabledAutomations();

    for (const automation of automations) {
      if (runningAutomations.has(automation.id)) {
        continue; // Already running, skip.
      }

      if (isDue(automation)) {
        runningAutomations.add(automation.id);
        void executeAutomation(automation).finally(() => {
          runningAutomations.delete(automation.id);
        });
      }
    }
  } catch (error) {
    console.error("[automation scheduler] tick failed:", error);
  }
}

/** Determine whether an automation is due to run. */
function isDue(automation: AutomationRecord): boolean {
  try {
    const interval = CronExpressionParser.parse(automation.cronExpression.trim());
    const now = new Date();
    const prev = interval.prev().toDate();

    if (automation.lastRunAt === null) {
      // First run ever — run if the previous scheduled time is in the past.
      return prev.getTime() < now.getTime();
    }

    // Run if the previous scheduled time has passed since the last run.
    return prev.getTime() > automation.lastRunAt;
  } catch {
    return false;
  }
}

/** Execute an automation: create session, run agent, store results. */
async function executeAutomation(automation: AutomationRecord): Promise<void> {
  const taskId = createTaskId();
  const sessionId = createMessageId();
  const assistantMessageId = createMessageId();
  const userMessageId = createMessageId();

  try {
    // 1. Resolve model and environment
    const modelSettings = readModelProviderSettings();
    const resolved = resolveProviderConfig(modelSettings);
    const modelId = resolveDefaultModel(resolved);
    const apiKey = resolveApiKey(resolved);
    const apiKeySource = resolved.apiKeySource;
    const apiKeyEnvVar = resolveApiKeyEnvVar(resolved);
    const environment = await resolveAgentEnvironment(null);

    // 2. Create the session
    const title = deriveSessionTitle(automation.prompt);
    const session = await createSession({
      id: sessionId,
      title,
      model: modelId,
      workspaceDir: null,
    });

    // 3. Create the user message
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

    // 4. Create the assistant message (placeholder)
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

    // 5. Build agent messages
    const agentMessages: AgentChatMessage[] = [
      { role: "user", content: automation.prompt },
    ];

    const messages = await buildAgentMessages(agentMessages, environment);

    const abortController = new AbortController();

    // 6. Run the agent
    await runAgentWithTools(
      {
        taskId,
        baseUrl: resolved.baseUrl,
        apiKey,
        apiKeySource,
        apiKeyEnvVar,
        model: modelId,
        messages,
        requestExtensions: buildThinkingRequestExtensions({
          models: resolved.models,
          modelId,
          thinkingEnabled: false,
        }),
      },
      {
        workspaceDir: null,
        taskId,
        signal: abortController.signal,
        tavilyConfig: null,
        allowPrivateNetworkAccess: false,
      },
      (event: AgentEvent) => {
        // Persist streaming content to IndexedDB silently.
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

        // On completion, update status and mark the automation run.
        if (event.type === "status") {
          if (event.status === "completed" || event.status === "failed" || event.status === "cancelled") {
            void updateMessage(assistantMessageId, {
              status: event.status,
              error: event.status === "completed" ? null : event.status,
            });

            // Read the final content for the summary.
            void (async () => {
              const assistant = await import("@/lib/db/messages").then((m) =>
                m.getMessage(assistantMessageId)
              );
              const summary = assistant?.content
                ? assistant.content.slice(0, 200).replace(/\n/g, " ")
                : `[${event.status}]`;
              await markAutomationRun(automation.id, session.id, summary);
            })();
          }
        }

        if (event.type === "error") {
          void updateMessage(assistantMessageId, {
            status: "failed",
            error: event.message,
          });

          void markAutomationRun(
            automation.id,
            session.id,
            `[error] ${event.message.slice(0, 200)}`
          );
        }
      }
    );
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    console.error(`[automation] ${automation.name} failed:`, message);

    // Mark as failed in the automation record.
    await markAutomationRun(automation.id, sessionId, `[failed] ${message.slice(0, 200)}`);

    // Update the assistant message if it exists.
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
