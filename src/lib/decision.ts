export type DecisionRiskLevel = "low" | "medium" | "high";
export type DecisionOutcome = "continue" | "ask_user" | "stop_path";
export type DecisionTrigger = "blocking_response";

export type DecisionOption = {
  id: string;
  label: string;
};

export type DecisionRequest = {
  sessionId: string;
  taskId: string;
  trigger: DecisionTrigger;
  summary: string;
  question: string;
  options: DecisionOption[];
  riskHints: string[];
  sessionKind: "standard" | "long_task";
  autonomyMode: "interactive" | "unattended";
  decisionPolicyVersion: string;
  assistantResponse?: string | null;
  candidateToolName?: string | null;
  candidateToolInput?: unknown;
};

export type DecisionResponse = {
  outcome: DecisionOutcome;
  selectedOptionId: string | null;
  reason: string;
  riskLevel: DecisionRiskLevel;
  recordAsAssumption: boolean;
  requiresUserConfirmation: boolean;
  assumption: string | null;
  suggestedContinuation: string | null;
};
