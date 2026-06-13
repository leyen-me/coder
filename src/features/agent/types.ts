import type { AgentMessageContent } from "./message-content";
import type { AgentToolCall, AgentToolDefinition } from "./tools/types";
import type { ApiToolCall } from "./tools/api-tool-call";
import type { SessionAutonomyMode, SessionKind } from "@/lib/db";
import type {
  DecisionOption,
  DecisionResponse,
  DecisionRiskLevel,
  DecisionTrigger,
} from "@/lib/decision";

export type AgentStatus =
  | "pending"
  | "running"
  | "cancelling"
  | "cancelled"
  | "completed"
  | "failed";

export type AgentChatMessage = {
  role: "user" | "assistant" | "system" | "tool";
  /** String for system/assistant/tool; string or multimodal parts for user (OpenAI format). */
  content?: AgentMessageContent;
  reasoning_content?: string;
  tool_calls?: ApiToolCall[];
  tool_call_id?: string;
  name?: string;
};

export type AgentEvent =
  | { type: "status"; taskId: string; status: AgentStatus }
  | { type: "thinking_delta"; taskId: string; delta: string }
  | { type: "content_delta"; taskId: string; delta: string }
  | { type: "turn_complete"; taskId: string; toolCalls: AgentToolCall[] }
  | {
      type: "handoff_required";
      taskId: string;
      contextUsage: AgentContextUsageSnapshot;
    }
  | {
      type: "tool_call_pending";
      taskId: string;
      toolCallId: string;
      name: string;
    }
  | {
      type: "tool_call_started";
      taskId: string;
      toolCallId: string;
      name: string;
      input: unknown;
    }
  | {
      type: "tool_call_finished";
      taskId: string;
      toolCallId: string;
      output?: unknown;
      errorText?: string;
    }
  | {
      type: "decision_requested";
      taskId: string;
      decisionId: string;
      trigger: DecisionTrigger;
      summary: string;
      question: string;
      options: DecisionOption[];
      riskLevel: DecisionRiskLevel;
      requiresUserConfirmation: boolean;
    }
  | {
      type: "decision_resolved";
      taskId: string;
      decisionId: string;
      trigger: DecisionTrigger;
      summary: string;
      question: string;
      options: DecisionOption[];
      response: DecisionResponse;
    }
  | { type: "done"; taskId: string }
  | { type: "error"; taskId: string; message: string }
  | {
      type: "chat_retry";
      taskId: string;
      attempt: number;
      maxAttempts: number;
    };

export type AgentStartInput = {
  taskId: string;
  baseUrl: string;
  apiKey: string;
  apiKeySource: "manual" | "env";
  apiKeyEnvVar: string;
  model: string;
  messages: AgentChatMessage[];
  tools?: AgentToolDefinition[];
  /** When false, thinking/content deltas are not emitted to the UI. */
  emitAssistantOutput?: boolean;
  /** Provider-specific fields merged into the chat completion request body. */
  requestExtensions?: Record<string, unknown>;
  /** Estimated provider context window used for proactive rollover before overflow. */
  maxContextTokens?: number;
  /** Ratio at which the agent proactively rolls over into a continuation session. */
  handoffTriggerThreshold?: number;
  /** Agent mode — controls which tools are available. Defaults to "agent". */
  agentMode?: AgentMode;
  sessionKind?: SessionKind;
  autonomyMode?: SessionAutonomyMode;
  decisionPolicyVersion?: string;
  decisionModel?: string | null;
};

export type ChatRetryState = {
  attempt: number;
  maxAttempts: number;
};

export type AgentContextUsageSnapshot = {
  usedTokens: number;
  maxTokens: number;
  remainingTokens: number;
  reservedTokens: number;
  triggerThreshold: number;
};

export type AgentHandoffRequest = {
  contextUsage: AgentContextUsageSnapshot;
};

export type SessionHandoffPhase =
  | "generating_handoff"
  | "creating_session"
  | "starting_new_session";

export type SessionHandoffState = {
  sessionId: string;
  phase: SessionHandoffPhase;
};

export type ActiveTaskState = {
  taskId: string;
  sessionId: string;
  assistantMessageId: string;
  status: AgentStatus;
  error: string | null;
  chatRetry: ChatRetryState | null;
  /** First user turn in this session — triggers AI title after completion. */
  isFirstTurn: boolean;
  model: string;
  userContent: string;
  thinkingEnabled: boolean;
  handoff: AgentHandoffRequest | null;
  agentMode: AgentMode;
  sessionKind: SessionKind;
  autonomyMode: SessionAutonomyMode;
  decisionPolicyVersion: string;
  decisionModel: string | null;
};

/** Agent vs Ask vs Plan mode — controls which tools are available to the model. */
export type AgentMode = "agent" | "ask" | "plan";

export type AgentEventHandler = (event: AgentEvent) => void;

export type AgentRunner = {
  start: (input: AgentStartInput, onEvent: AgentEventHandler) => Promise<void>;
  cancel: (taskId: string) => Promise<void>;
};

