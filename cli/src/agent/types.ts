/**
 * Agent types for the Coder CLI.
 * Mirrors the types from src/features/agent/types.ts.
 */

export type AgentStatus =
  | "pending"
  | "running"
  | "cancelling"
  | "cancelled"
  | "completed"
  | "failed";

export type AgentChatMessage = {
  role: "user" | "assistant" | "system" | "tool";
  content?: string | Array<{ type: string; text?: string; image_url?: { url: string } }>;
  reasoning_content?: string;
  tool_calls?: Array<{
    id: string;
    type: "function";
    function: { name: string; arguments: string };
  }>;
  tool_call_id?: string;
  name?: string;
};

export type AgentMode = "agent" | "ask";

export type TokenUsage = {
  promptTokens: number;
  completionTokens: number;
  totalTokens: number;
};

export type AgentEvent =
  | { type: "status"; taskId: string; status: AgentStatus }
  | { type: "thinking_delta"; taskId: string; delta: string }
  | { type: "content_delta"; taskId: string; delta: string }
  | { type: "tool_call_pending"; taskId: string; toolCallId: string; name: string }
  | { type: "tool_call_started"; taskId: string; toolCallId: string; name: string; input: unknown }
  | { type: "tool_call_finished"; taskId: string; toolCallId: string; output?: unknown; errorText?: string }
  | { type: "done"; taskId: string; usage?: TokenUsage }
  | { type: "error"; taskId: string; message: string };

export type AgentEventHandler = (event: AgentEvent) => void;

export type AgentStartInput = {
  taskId: string;
  baseUrl: string;
  apiKey: string;
  apiKeySource: "manual" | "env";
  apiKeyEnvVar: string;
  model: string;
  messages: AgentChatMessage[];
  agentMode: AgentMode;
  maxContextTokens?: number;
  handoffTriggerThreshold?: number;
};
