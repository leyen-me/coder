import type {
  DecisionOption,
  DecisionRequest,
} from "@/lib/decision";

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
  sessionKind: "standard" | "long_task" | "automation";
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
