export type MessageRole = "user" | "assistant";

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

export type MessageRecord = {
  id: string;
  sessionId: string;
  role: MessageRole;
  content: string;
  thinking: string;
  toolInvocations: MessageToolInvocation[];
  status: MessageStatus;
  taskId: string | null;
  error: string | null;
  createdAt: number;
};

export type ChatHistoryItem = {
  id: string;
  title: string;
  relativeTime: string;
  updatedAt: number;
};
