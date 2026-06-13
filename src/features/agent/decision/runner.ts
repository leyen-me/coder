import type { AgentChatMessage } from "../types";
import { AgentCancellationError, throwIfAborted } from "../cancellation";
import { cancelAgent, startAgent } from "../runner";
import type { DecisionRequest, DecisionResponse } from "@/lib/decision";
import {
  buildProxyDecisionUserPrompt,
  PROXY_DECISION_SYSTEM_PROMPT,
} from "./prompt";

function extractJsonObject(content: string): string {
  const trimmed = content.trim();
  if (!trimmed) {
    throw new Error("Decision model returned empty content");
  }

  const fencedMatch = trimmed.match(/```(?:json)?\s*([\s\S]*?)```/i);
  if (fencedMatch?.[1]) {
    return fencedMatch[1].trim();
  }

  const firstBrace = trimmed.indexOf("{");
  const lastBrace = trimmed.lastIndexOf("}");
  if (firstBrace === -1 || lastBrace === -1 || lastBrace <= firstBrace) {
    throw new Error("Decision model did not return a JSON object");
  }

  return trimmed.slice(firstBrace, lastBrace + 1);
}

function normalizeDecisionResponse(raw: unknown): DecisionResponse {
  if (!raw || typeof raw !== "object") {
    throw new Error("Decision response must be an object");
  }

  const value = raw as Record<string, unknown>;
  const outcome = value.outcome;
  const riskLevel = value.riskLevel;

  if (
    outcome !== "continue" &&
    outcome !== "complete" &&
    outcome !== "ask_user" &&
    outcome !== "stop_path"
  ) {
    throw new Error("Decision response has an invalid outcome");
  }

  if (riskLevel !== "low" && riskLevel !== "medium" && riskLevel !== "high") {
    throw new Error("Decision response has an invalid risk level");
  }

  return {
    outcome,
    selectedOptionId:
      typeof value.selectedOptionId === "string" ? value.selectedOptionId : null,
    reason:
      typeof value.reason === "string" && value.reason.trim()
        ? value.reason.trim()
        : "No reason provided.",
    riskLevel,
    recordAsAssumption: value.recordAsAssumption === true,
    requiresUserConfirmation: value.requiresUserConfirmation === true,
    assumption:
      typeof value.assumption === "string" && value.assumption.trim()
        ? value.assumption.trim()
        : null,
    suggestedContinuation:
      typeof value.suggestedContinuation === "string" &&
      value.suggestedContinuation.trim()
        ? value.suggestedContinuation.trim()
        : null,
  };
}

export async function requestProxyDecision(input: {
  taskId: string;
  model: string;
  baseUrl: string;
  apiKey: string;
  apiKeySource: "manual" | "env";
  apiKeyEnvVar: string;
  request: DecisionRequest;
  signal?: AbortSignal;
}): Promise<DecisionResponse> {
  const decisionTaskId = `${input.taskId}:decision:${crypto.randomUUID()}`;
  throwIfAborted(input.signal, decisionTaskId);

  const messages: AgentChatMessage[] = [
    { role: "system", content: PROXY_DECISION_SYSTEM_PROMPT },
    { role: "user", content: buildProxyDecisionUserPrompt(input.request) },
  ];

  let content = "";
  let detachAbortListener = () => {};

  try {
    if (input.signal) {
      const onAbort = () => {
        void cancelAgent(decisionTaskId);
      };
      detachAbortListener = () => {
        input.signal?.removeEventListener("abort", onAbort);
      };
      input.signal.addEventListener("abort", onAbort, { once: true });
    }

    await new Promise<void>((resolve, reject) => {
      void startAgent(
        {
          taskId: decisionTaskId,
          baseUrl: input.baseUrl,
          apiKey: input.apiKey,
          apiKeySource: input.apiKeySource,
          apiKeyEnvVar: input.apiKeyEnvVar,
          model: input.model,
          messages,
        },
        (event) => {
          if (event.type === "content_delta") {
            content += event.delta;
            return;
          }

          if (event.type === "error") {
            reject(new Error(event.message));
            return;
          }

          if (event.type === "status") {
            if (event.status === "completed") {
              resolve();
              return;
            }

            if (event.status === "failed" || event.status === "cancelled") {
              reject(
                new Error(
                  `Decision model ended with status: ${event.status}`
                )
              );
            }
          }
        }
      ).catch(reject);
    });
  } catch (error) {
    if (input.signal?.aborted) {
      throw new AgentCancellationError(decisionTaskId);
    }
    throw error;
  } finally {
    detachAbortListener();
  }

  return normalizeDecisionResponse(JSON.parse(extractJsonObject(content)));
}
