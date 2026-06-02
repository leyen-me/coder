import type { AgentMessageContent } from "./message-content";
import type { AgentToolCall, AgentToolDefinition } from "./tools/types";
import type { ApiToolCall } from "./tools/api-tool-call";

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
  | { type: "done"; taskId: string }
  | { type: "error"; taskId: string; message: string };

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
};

export type ActiveTaskState = {
  taskId: string;
  sessionId: string;
  assistantMessageId: string;
  status: AgentStatus;
  error: string | null;
  /** First user turn in this session — triggers AI title after completion. */
  isFirstTurn: boolean;
  model: string;
  userContent: string;
};

export type AgentEventHandler = (event: AgentEvent) => void;

export type AgentRunner = {
  start: (input: AgentStartInput, onEvent: AgentEventHandler) => Promise<void>;
  cancel: (taskId: string) => Promise<void>;
};

export const MAX_AGENT_TOOL_ITERATIONS = 8;
