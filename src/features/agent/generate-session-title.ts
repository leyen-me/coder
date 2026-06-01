import { invoke, isTauri } from "@tauri-apps/api/core";

import { deriveSessionTitle, getMessage, updateSessionTitle } from "@/lib/db";

import { chatCompletionsUrl } from "./openai-url";
import {
  clearSessionTitleGenerating,
  markSessionTitleGenerating,
} from "./session-title-store";

const TITLE_MAX_LENGTH = 48;
const ASSISTANT_SNIPPET_MAX = 600;

export const SESSION_TITLE_SYSTEM_PROMPT = `You write short chat session titles for a sidebar history list.
Rules:
- Output ONLY the title text, no quotes, no markdown, no explanation.
- Use the same language as the user's message (Chinese if the user wrote in Chinese, etc.).
- Capture the main task or topic in at most 12 words or ~20 Chinese characters.
- Prefer concrete nouns (feature, bug, file, API) over vague phrases like "help me" or "question".`;

type ChatCompletionResponse = {
  choices?: Array<{
    message?: { content?: string };
  }>;
};

export function normalizeSessionTitle(
  raw: string,
  maxLength = TITLE_MAX_LENGTH
): string {
  const unquoted = raw
    .trim()
    .replace(/^["'`「『【]+|["'`」』】]+$/g, "")
    .replace(/\s+/g, " ");
  if (!unquoted) {
    return "";
  }
  if (unquoted.length <= maxLength) {
    return unquoted;
  }
  return `${unquoted.slice(0, maxLength - 1)}…`;
}

export function parseTitleFromCompletionBody(body: unknown): string | null {
  const parsed = body as ChatCompletionResponse;
  const content = parsed.choices?.[0]?.message?.content;
  if (typeof content !== "string") {
    return null;
  }
  const title = normalizeSessionTitle(content);
  return title || null;
}

type SessionTitleRequest = {
  baseUrl: string;
  apiKey: string;
  apiKeySource: "manual" | "env";
  apiKeyEnvVar: string;
  model: string;
  userMessage: string;
  assistantMessage: string;
};

async function requestSessionTitleViaFetch(
  input: SessionTitleRequest
): Promise<string | null> {
  const userMessage = input.userMessage.trim();
  if (!userMessage) {
    return null;
  }

  const assistantSnippet = input.assistantMessage
    .trim()
    .slice(0, ASSISTANT_SNIPPET_MAX);
  const userPrompt = assistantSnippet
    ? `User message:\n${userMessage}\n\nAssistant reply (excerpt):\n${assistantSnippet}`
    : `User message:\n${userMessage}`;

  const response = await fetch(chatCompletionsUrl(input.baseUrl), {
    method: "POST",
    headers: {
      Authorization: `Bearer ${input.apiKey}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify({
      model: input.model,
      stream: false,
      max_tokens: 64,
      temperature: 0.3,
      messages: [
        { role: "system", content: SESSION_TITLE_SYSTEM_PROMPT },
        { role: "user", content: userPrompt },
      ],
    }),
  });

  if (!response.ok) {
    return null;
  }

  const body: unknown = await response.json();
  return parseTitleFromCompletionBody(body);
}

async function requestSessionTitleViaTauri(
  input: SessionTitleRequest
): Promise<string | null> {
  const raw = await invoke<string | null>("agent_generate_session_title", {
    params: {
      baseUrl: input.baseUrl,
      apiKey: input.apiKey || null,
      apiKeySource: input.apiKeySource,
      apiKeyEnvVar: input.apiKeyEnvVar,
      model: input.model,
      userMessage: input.userMessage,
      assistantMessage: input.assistantMessage,
    },
  });

  if (raw == null) {
    return null;
  }

  const title = normalizeSessionTitle(raw);
  return title || null;
}

export async function requestSessionTitle(
  input: SessionTitleRequest
): Promise<string | null> {
  if (!input.apiKey.trim() && input.apiKeySource !== "env") {
    return null;
  }

  if (isTauri()) {
    return requestSessionTitleViaTauri(input);
  }

  if (!input.apiKey.trim()) {
    return null;
  }

  return requestSessionTitleViaFetch(input);
}

export async function applyGeneratedSessionTitle(input: {
  sessionId: string;
  baseUrl: string;
  apiKey: string;
  apiKeySource: "manual" | "env";
  apiKeyEnvVar: string;
  model: string;
  userMessage: string;
  assistantMessageId: string;
}): Promise<void> {
  markSessionTitleGenerating(input.sessionId);

  try {
    const assistant = await getMessage(input.assistantMessageId);
    const assistantText =
      assistant?.content.trim() || assistant?.thinking.trim() || "";

    const generated = await requestSessionTitle({
      baseUrl: input.baseUrl,
      apiKey: input.apiKey,
      apiKeySource: input.apiKeySource,
      apiKeyEnvVar: input.apiKeyEnvVar,
      model: input.model,
      userMessage: input.userMessage,
      assistantMessage: assistantText,
    });

    const title = generated ?? deriveSessionTitle(input.userMessage);

    if (!title) {
      return;
    }

    await updateSessionTitle(input.sessionId, title);
  } finally {
    clearSessionTitleGenerating(input.sessionId);
  }
}
