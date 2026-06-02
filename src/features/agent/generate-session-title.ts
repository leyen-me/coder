import { invoke, isTauri } from "@tauri-apps/api/core";

import { deriveSessionTitle, getMessage, updateSessionTitle } from "@/lib/db";

import { chatCompletionsUrl } from "./openai-url";
import {
  clearSessionTitleGenerating,
  markSessionTitleGenerating,
} from "./session-title-store";

const TITLE_MAX_LENGTH = 48;
const TITLE_MAX_TOKENS = 128;

export const SESSION_TITLE_SYSTEM_PROMPT = `You write short chat session titles for a sidebar history list.
Output ONLY the title text (no quotes, no markdown). Same language as the user. At most ~20 Chinese characters or 12 English words.`;

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
  const content = (
    body as { choices?: Array<{ message?: { content?: unknown } }> }
  ).choices?.[0]?.message?.content;
  if (typeof content !== "string") {
    return null;
  }
  return normalizeSessionTitle(content) || null;
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

async function requestSessionTitle(
  input: SessionTitleRequest
): Promise<string | null> {
  const userMessage = input.userMessage.trim();
  if (!userMessage) {
    return null;
  }
  if (!input.apiKey.trim() && input.apiKeySource !== "env") {
    return null;
  }

  const snippet = input.assistantMessage.trim().slice(0, 600);
  const userPrompt = snippet
    ? `User message:\n${userMessage}\n\nAssistant reply (excerpt):\n${snippet}`
    : `User message:\n${userMessage}`;

  if (isTauri()) {
    try {
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
      return raw ? normalizeSessionTitle(raw) || null : null;
    } catch {
      return null;
    }
  }

  if (!input.apiKey.trim()) {
    return null;
  }

  const response = await fetch(chatCompletionsUrl(input.baseUrl), {
    method: "POST",
    headers: {
      Authorization: `Bearer ${input.apiKey}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify({
      model: input.model,
      stream: false,
      max_tokens: TITLE_MAX_TOKENS,
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

  return parseTitleFromCompletionBody(await response.json());
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
