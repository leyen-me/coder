import type {
  DecisionOption,
  DecisionRequest,
} from "@/lib/decision";

const BLOCKING_RESPONSE_PATTERNS = [
  /\?/,
  /要不要继续/,
  /你更偏向/,
  /是否继续/,
  /是否需要/,
  /可以吗/,
  /要我继续/,
  /需要你决定/,
  /need your input/i,
  /which option/i,
  /should i continue/i,
  /would you like me to/i,
  /please confirm/i,
];

function safeDefaultOptions(): DecisionOption[] {
  return [
    { id: "continue_conservative", label: "Continue with the safest conservative default" },
    { id: "ask_user", label: "Pause and ask the real user" },
    { id: "stop_path", label: "Stop the current path" },
  ];
}

export function detectBlockingAssistantResponse(content: string): boolean {
  const trimmed = content.trim();
  if (!trimmed) {
    return false;
  }

  return BLOCKING_RESPONSE_PATTERNS.some((pattern) => pattern.test(trimmed));
}

export function buildBlockingDecisionRequest(input: {
  sessionId: string;
  taskId: string;
  assistantResponse: string;
  sessionKind: "standard" | "long_task";
  autonomyMode: "interactive" | "unattended";
  decisionPolicyVersion: string;
}): DecisionRequest | null {
  if (!detectBlockingAssistantResponse(input.assistantResponse)) {
    return null;
  }

  return {
    sessionId: input.sessionId,
    taskId: input.taskId,
    trigger: "blocking_response",
    summary:
      "The main agent is about to pause for user input in an unattended long-task session.",
    question: input.assistantResponse.trim(),
    options: safeDefaultOptions(),
    riskHints: [
      "Prefer a conservative default when the task can continue safely.",
      "Do not pretend to be the real user.",
    ],
    sessionKind: input.sessionKind,
    autonomyMode: input.autonomyMode,
    decisionPolicyVersion: input.decisionPolicyVersion,
    assistantResponse: input.assistantResponse.trim(),
  };
}
