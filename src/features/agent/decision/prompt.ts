import type { DecisionRequest } from "@/lib/decision";

export const PROXY_DECISION_SYSTEM_PROMPT = `You are the proxy decision model for an unattended coding task.
Return exactly one JSON object and nothing else.
You will receive the full conversation history between the user and the main agent.
Your job is to review the conversation and decide whether the main agent's latest answer has genuinely completed the user's original request.

- If the task is truly finished, return complete.
- If more work is needed, return continue and provide the exact next user-style continuation input that should be sent back to the main agent.
- Never ask for real-user confirmation unless the request explicitly requires new external information that the proxy cannot supply.

JSON schema:
{
  "outcome": "continue" | "complete",
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
        "Based on the full conversation above, decide whether the unattended long-task session is complete, or provide the next user-style continuation input for the main agent.",
      request,
    },
    null,
    2
  );
}
