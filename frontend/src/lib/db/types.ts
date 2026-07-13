import type {
  DecisionOption,
  DecisionResponse,
  DecisionRiskLevel,
  DecisionTrigger,
} from "@/lib/decision";
import type { ProviderId } from "@/lib/model-provider/types";

export type MessageRole = "user" | "assistant";

/** Distinguishes structured artifact messages from regular chat replies. */
export type MessageKind = "plan" | "handoff" | "handoff_continuation";

export type SessionKind = "standard" | "long_task";
export type SessionAutonomyMode = "interactive" | "unattended";

export const DEFAULT_SESSION_KIND: SessionKind = "standard";
export const DEFAULT_SESSION_AUTONOMY_MODE: SessionAutonomyMode = "interactive";
export const DEFAULT_DECISION_POLICY_VERSION = "mvp-v1";

export type SessionContextUsageSnapshot = {
  usedTokens: number;
  maxTokens: number;
  remainingTokens: number;
  reservedTokens: number;
  triggerThreshold: number;
  source: "handoff";
  updatedAt: number;
};

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
  /** The provider that owns this session's model. */
  provider: ProviderId;
  /** Absolute path; owned by this session after the first message. */
  workspaceDir: string | null;
  sessionKind: SessionKind;
  autonomyMode: SessionAutonomyMode;
  decisionPolicyVersion: string;
  decisionModel?: string | null;
  parentSessionId?: string | null;
  handoffFromSessionId?: string | null;
  handoffMessageId?: string | null;
  /** Name of the .plan/ file bound to this session, if any. */
  planFileName?: string | null;
  /** Timestamp (ms) when the plan was built/executed. null/undefined means not yet built. */
  planBuiltAt?: number | null;
  /** Latest persisted context-usage snapshot for this session. */
  contextUsageSnapshot?: SessionContextUsageSnapshot | null;
  /** Timestamp (ms) when the session was pinned. null means not pinned. */
  pinnedAt?: number | null;
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
  /** Agent process duration in ms, persisted on completion for historical view. */
  durationMs?: number;
  /**
   * Actual token usage reported by the provider's API response.
   * Only present on assistant messages, and only when the provider returns usage data.
   */
  usage?: {
    promptTokens: number;
    completionTokens: number;
    totalTokens: number;
  };
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

export type ChatHistoryItem = {
  id: string;
  title: string;
  relativeTime: string;
  updatedAt: number;
  workspaceDir: string | null;
  sessionKind: SessionKind;
  pinnedAt: number | null;
};

export type RemoteTargetAuth =
  | { type: "key"; keyPath: string }
  | { type: "keyContent"; content: string }
  | { type: "password"; password: string }
  | { type: "agent" };

export type RemoteTargetConfig = {
  alias: string;
  host: string;
  port: number;
  user: string;
  auth: RemoteTargetAuth;
  enabled: boolean;
};

export type McpServerConfig = {
  id: string;
  name: string;
  transport: "stdio" | "http";
  command: string;
  args: string[];
  env: Record<string, string>;
  url: string;
  headers: Record<string, string>;
  enabled: boolean;
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
