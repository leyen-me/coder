
import { updateSessionTitle } from "@/lib/db";
import { apiPost } from "@/lib/api/client";

import {
  clearSessionTitleGenerating,
  markSessionTitleGenerating,
} from "./session-title-store";

const TITLE_MAX_LENGTH = 48;

export const SESSION_TITLE_SYSTEM_PROMPT = `You write short chat session titles for a sidebar history list.
Output ONLY the title text (no quotes, no markdown). Same language as the user. At most ~20 Chinese characters or 12 English words.`;

export function normalizeSessionTitle(
  raw: string,
  maxLength = TITLE_MAX_LENGTH
): string {
  // Step 1: strip thinking blocks that some providers embed when thinking is enabled.
  const withoutThink = raw
    .replace(new RegExp(`<${"think"}>[\\s\\S]*?<\\/${"think"}>`, "gi"), "")
    .trim();
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

  try {
    const rawTitle = await apiPost<string | null>("/api/agent/generate_title", {
      baseUrl: input.baseUrl,
      apiKey: input.apiKey.trim() || null,
      apiKeySource: input.apiKeySource,
      apiKeyEnvVar: input.apiKeyEnvVar,
      model: input.model,
      userMessage,
    });

    if (typeof rawTitle !== "string") {
      return null;
    }

    return normalizeSessionTitle(rawTitle) || null;
  } catch {
    return null;
  }
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
