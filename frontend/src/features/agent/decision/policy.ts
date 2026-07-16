import type {
  DecisionOption,
  DecisionRequest,
  DecisionResponse,
} from "@/lib/decision";
import type { AgentChatMessage } from "../types";

function decisionOptions(): DecisionOption[] {
  return [
    { id: "complete", label: "The task is complete and the assistant answer can stand as final" },
    {
      id: "continue",
      label: "The task is not complete; provide the next user-style continuation input",
    },
  ];
}

export function buildFinalAnswerDecisionRequest(input: {
  sessionId: string;
  taskId: string;
  assistantResponse: string;
  sessionKind: "standard" | "long_task";
  autonomyMode: "interactive" | "unattended";
  decisionPolicyVersion: string;
}): DecisionRequest {
  return {
    sessionId: input.sessionId,
    taskId: input.taskId,
    trigger: "final_answer",
    summary:
      "The main agent has produced a candidate final answer in an unattended long-task session.",
    question: input.assistantResponse.trim(),
    options: decisionOptions(),
    riskHints: [
      "Return complete only if the task is genuinely finished.",
      "If more work is needed, return continue and provide the next user-style continuation input.",
    ],
    sessionKind: input.sessionKind,
    autonomyMode: input.autonomyMode,
    decisionPolicyVersion: input.decisionPolicyVersion,
    assistantResponse: input.assistantResponse.trim(),
  };
}

export function buildProxyContinuationUserMessage(
  response: DecisionResponse
): AgentChatMessage {
  return {
    role: "user",
    content:
      response.suggestedContinuation?.trim() ||
      "继续，任务还没有完成。请基于当前上下文自行推进，直到真正完成为止。",
  };
}
