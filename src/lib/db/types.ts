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

export type ChatHistoryItem = {
  id: string;
  title: string;
  relativeTime: string;
  updatedAt: number;
};
