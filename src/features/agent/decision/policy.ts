import type {
  DecisionOption,
  DecisionRequest,
  DecisionResponse,
  DecisionRiskLevel,
} from "@/lib/decision";
import type { AgentToolCall } from "../tools/types";

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

const HIGH_RISK_SHELL_PATTERNS = [
  /\bgit\s+push\b/i,
  /\bgh\s+pr\s+merge\b/i,
  /\bgh\s+release\b/i,
  /\bnpm\s+publish\b/i,
  /\bpnpm\s+publish\b/i,
  /\byarn\s+publish\b/i,
  /\bterraform\s+apply\b/i,
  /\bkubectl\s+(apply|delete|rollout)\b/i,
  /\bdocker\s+push\b/i,
  /\brm\s+-rf\b/i,
  /\bdel\s+/i,
  /\berase\s+/i,
  /\bRemove-Item\b/i,
  /\bvercel\s+deploy\b/i,
  /\bflyctl\s+deploy\b/i,
];

const HIGH_RISK_PATH_PATTERNS = [
  /\.env(\.|$)/i,
  /credentials/i,
  /secret/i,
  /token/i,
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

export function classifyToolRisk(
  toolName: string,
  toolInput: unknown
): { riskLevel: DecisionRiskLevel; reason: string | null } {
  if (toolName === "shell") {
    const command =
      toolInput &&
      typeof toolInput === "object" &&
      "command" in toolInput &&
      typeof toolInput.command === "string"
        ? toolInput.command
        : "";
    if (HIGH_RISK_SHELL_PATTERNS.some((pattern) => pattern.test(command))) {
      return {
        riskLevel: "high",
        reason: "The shell command appears to publish, deploy, push remotely, or perform destructive deletion.",
      };
    }
    return { riskLevel: "medium", reason: null };
  }

  if (
    toolName === "write_file" ||
    toolName === "replace_file" ||
    toolName === "edit_file"
  ) {
    const path =
      toolInput &&
      typeof toolInput === "object" &&
      "path" in toolInput &&
      typeof toolInput.path === "string"
        ? toolInput.path
        : "";
    if (HIGH_RISK_PATH_PATTERNS.some((pattern) => pattern.test(path))) {
      return {
        riskLevel: "high",
        reason: "The file path appears to contain secrets or credentials.",
      };
    }
    return { riskLevel: "low", reason: null };
  }

  return { riskLevel: "low", reason: null };
}

export function buildHighRiskToolDecisionResponse(input: {
  toolCall: AgentToolCall;
  reason: string;
}): DecisionResponse {
  return {
    outcome: "ask_user",
    selectedOptionId: "ask_user",
    reason: `${input.reason} High-risk operations cannot be auto-approved in unattended mode.`,
    riskLevel: "high",
    recordAsAssumption: false,
    requiresUserConfirmation: true,
    assumption: null,
    suggestedContinuation: null,
  };
}
