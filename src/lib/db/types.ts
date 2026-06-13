import type {
  DecisionOption,
  DecisionResponse,
  DecisionRiskLevel,
  DecisionTrigger,
} from "@/lib/decision";

export type MessageRole = "user" | "assistant";

/** Distinguishes structured artifact messages from regular chat replies. */
export type MessageKind = "plan" | "handoff" | "handoff_continuation";

export type SessionKind = "standard" | "long_task";
export type SessionAutonomyMode = "interactive" | "unattended";

export const DEFAULT_SESSION_KIND: SessionKind = "standard";
export const DEFAULT_SESSION_AUTONOMY_MODE: SessionAutonomyMode = "interactive";
export const DEFAULT_DECISION_POLICY_VERSION = "mvp-v1";

export type MessageStatus =
  | "pending"
  | "streaming"
  | "completed"
  | "cancelled"
  | "failed";

export type SessionRecord = {
  id: string;
  title: string;
  model: string;
  /** Absolute path; owned by this session after the first message. */
  workspaceDir: string | null;
  sessionKind: SessionKind;
  autonomyMode: SessionAutonomyMode;
  decisionPolicyVersion: string;
  decisionModel?: string | null;
  parentSessionId?: string | null;
  handoffFromSessionId?: string | null;
  handoffMessageId?: string | null;
  createdAt: number;
  updatedAt: number;
};

export type MessageToolState =
  | "input-streaming"
  | "input-available"
  | "output-available"
  | "output-error";

export type MessageToolInvocation = {
  id: string;
  name: string;
  input: unknown;
  output?: unknown;
  errorText?: string;
  state: MessageToolState;
};

export type MessageProcessStep =
  | {
      id: string;
      kind: "reasoning" | "answer";
      text: string;
    }
  | {
      id: string;
      kind: "tool";
      toolCallId: string;
    }
  | {
      id: string;
      kind: "decision";
      trigger: DecisionTrigger;
      summary: string;
      question: string;
      options: DecisionOption[];
      riskLevel: DecisionRiskLevel;
      status: "requested" | "resolved";
      requiresUserConfirmation: boolean;
      response?: DecisionResponse | null;
    };

/** Persisted user image (data URL) for chat history and agent replay. */
export type MessageImageAttachment = {
  id: string;
  filename?: string;
  mediaType?: string;
  url: string;
};

export type MessageRecord = {
  id: string;
  sessionId: string;
  role: MessageRole;
  /** When set, marks structured plan/handoff artifact messages. */
  messageKind?: MessageKind;
  content: string;
  /** User-uploaded images only; empty for assistant messages. */
  images?: MessageImageAttachment[];
  /** Skill slugs explicitly referenced via /slug in the user message. */
  referencedSkills?: string[];
  thinking: string;
  processSteps?: MessageProcessStep[];
  toolInvocations: MessageToolInvocation[];
  status: MessageStatus;
  taskId: string | null;
  error: string | null;
  createdAt: number;
};

export type UserSkillRecord = {
  id: string;
  slug: string;
  name: string;
  description: string;
  content: string;
  enabled: boolean;
  createdAt: number;
  updatedAt: number;
};

export type SystemSkillPreference = {
  skillId: string;
  enabled: boolean;
  updatedAt: number;
};

export type AutomationAgentMode = "agent" | "ask";

export type AutomationRunStatus =
  | "running"
  | "completed"
  | "failed"
  | "cancelled";

export type AutomationRunRecord = {
  id: string;
  sessionId: string;
  startedAt: number;
  completedAt: number | null;
  summary: string;
  status: AutomationRunStatus;
};

export type AutomationRecord = {
  id: string;
  name: string;
  description: string;
  cronExpression: string;
  prompt: string;
  /** Absolute workspace path used when the automation runs. */
  workspaceDir: string | null;
  /** Model id from the active provider configuration. */
  model: string;
  agentMode: AutomationAgentMode;
  thinkingEnabled: boolean;
  enabled: boolean;
  /** Newest first. */
  runs: AutomationRunRecord[];
  createdAt: number;
  updatedAt: number;
};

export type ChatHistoryItem = {
  id: string;
  title: string;
  relativeTime: string;
  updatedAt: number;
  workspaceDir: string | null;
  sessionKind: SessionKind;
};

export type AgentTodoStatus =
  | "pending"
  | "in_progress"
  | "completed"
  | "cancelled";

export type AgentTodoRecord = {
  id: string;
  sessionId: string;
  content: string;
  status: AgentTodoStatus;
  order: number;
  createdAt: number;
  updatedAt: number;
};
