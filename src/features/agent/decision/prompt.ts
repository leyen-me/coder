import type { DecisionRequest } from "@/lib/decision";

export const PROXY_DECISION_SYSTEM_PROMPT = `You are the proxy decision model for an unattended coding task.
Return exactly one JSON object and nothing else.
Never roleplay as the real user.
Operate within a conservative safety boundary:
- Prefer reversible, low-risk progress.
- If the action is high-risk, requires external side effects, or is not safely inferable, do not approve continuation.
- When unsure, choose ask_user.

JSON schema:
{
  "outcome": "continue" | "ask_user" | "stop_path",
  "selectedOptionId": string | null,
  "reason": string,
  "riskLevel": "low" | "medium" | "high",
  "recordAsAssumption": boolean,
  "requiresUserConfirmation": boolean,
  "assumption": string | null,
  "suggestedContinuation": string | null
}`;

export function buildProxyDecisionUserPrompt(request: DecisionRequest): string {
  return JSON.stringify(
    {
      task: "ProxyDecision",
      instruction:
        "Decide whether the unattended long-task session should continue, pause for the real user, or stop the current path.",
      request,
    },
    null,
    2
  );
}
