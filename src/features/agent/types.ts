export type AgentStatus =
  | "pending"
  | "running"
  | "cancelling"
  | "cancelled"
  | "completed"
  | "failed";

export type AgentChatMessage = {
  role: "user" | "assistant" | "system";
  content: string;
};

export type AgentEvent =
  | { type: "status"; taskId: string; status: AgentStatus }
  | { type: "thinking_delta"; taskId: string; delta: string }
  | { type: "content_delta"; taskId: string; delta: string }
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
};

export type ActiveTaskState = {
  taskId: string;
  sessionId: string;
  assistantMessageId: string;
  status: AgentStatus;
  error: string | null;
};

export type AgentEventHandler = (event: AgentEvent) => void;

export type AgentRunner = {
  start: (input: AgentStartInput, onEvent: AgentEventHandler) => Promise<void>;
  cancel: (taskId: string) => Promise<void>;
};
