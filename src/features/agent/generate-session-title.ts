import { invoke, isTauri } from "@tauri-apps/api/core";

import { updateSessionTitle } from "@/lib/db";

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
  // Step 1: strip <think>...</think> tags that some providers (e.g. MiniMax)
  // embed in the response content when thinking is enabled.
  const withoutThink = raw.replace(/<think>[\s\S]*?<\/think>/g, "").trim();
  // Step 2: remove surrounding quotes and normalize whitespace
  const unquoted = withoutThink
    .replace(/^["'`「『【]+|["'`」』】]+$/g, "")
    .replace(/\s+/g, " ")
    .trim();
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

  const userPrompt = `Summarize this chat session based on the user's first message:\n\n${userMessage}`;

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
}): Promise<void> {
  markSessionTitleGenerating(input.sessionId);

  try {
    const title = await requestSessionTitle({
      baseUrl: input.baseUrl,
      apiKey: input.apiKey,
      apiKeySource: input.apiKeySource,
      apiKeyEnvVar: input.apiKeyEnvVar,
      model: input.model,
      userMessage: input.userMessage,
    });

    if (!title) {
      return;
    }

    await updateSessionTitle(input.sessionId, title);
  } finally {
    clearSessionTitleGenerating(input.sessionId);
  }
}
