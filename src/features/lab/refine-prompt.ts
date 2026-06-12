import { invoke, isTauri } from "@tauri-apps/api/core";

import { chatCompletionsUrl } from "@/features/agent/openai-url";

import { resolvePromptRefineSystemPrompt } from "./storage";
import { getLabSettingsSnapshot } from "./lab-settings-store";
import type { LabSettings } from "./types";

export const PROMPT_REFINE_TIMEOUT_MS = 60_000;
const REFINE_MAX_TOKENS = 2048;
const CONTEXT_MESSAGE_LIMIT = 10;
const CONTEXT_CONTENT_MAX_LENGTH = 800;

export type RefineContextMessage = {
  role: string;
  content: string;
};

export function normalizeRefinedPrompt(raw: string): string {
  return raw
    .trim()
    .replace(/^["'`「『【]+|["'`」』】]+$/g, "")
    .trim();
}

function parseRefinedPromptFromCompletionBody(body: unknown): string | null {
  const content = (
    body as { choices?: Array<{ message?: { content?: unknown } }> }
  ).choices?.[0]?.message?.content;
  if (typeof content !== "string") {
    return null;
  }
  return normalizeRefinedPrompt(content) || null;
}

export function buildRefineContextMessages(
  messages: Array<{ role: string; content: string; thinking?: string }>
): RefineContextMessage[] {
  return messages
    .filter((message) => message.role === "user" || message.role === "assistant")
    .slice(-CONTEXT_MESSAGE_LIMIT)
    .map((message) => {
      const content =
        message.role === "assistant"
          ? (message.content.trim() || message.thinking?.trim() || "")
          : message.content.trim();

      return {
        role: message.role,
        content: content.slice(0, CONTEXT_CONTENT_MAX_LENGTH),
      };
    })
    .filter((message) => message.content.length > 0);
}

function buildRefineUserPrompt(
  userPrompt: string,
  contextMessages: RefineContextMessage[]
): string {
  const trimmedPrompt = userPrompt.trim();
  if (contextMessages.length === 0) {
    return `User prompt:\n${trimmedPrompt}`;
  }

  const contextBlock = contextMessages
    .map((message) => `${message.role}: ${message.content}`)
    .join("\n\n");

  return `Conversation context:\n${contextBlock}\n\nUser prompt:\n${trimmedPrompt}`;
}

type RefinePromptRequest = {
  baseUrl: string;
  apiKey: string;
  apiKeySource: "manual" | "env";
  apiKeyEnvVar: string;
  model: string;
  userPrompt: string;
  systemPrompt: string;
  contextMessages?: RefineContextMessage[];
  signal?: AbortSignal;
};

async function requestRefinedPrompt(
  input: RefinePromptRequest
): Promise<string | null> {
  const userPrompt = input.userPrompt.trim();
  if (!userPrompt) {
    return null;
  }
  if (!input.apiKey.trim() && input.apiKeySource !== "env") {
    return null;
  }

  const systemPrompt = input.systemPrompt.trim();
  if (!systemPrompt) {
    return null;
  }

  const userContent = buildRefineUserPrompt(
    userPrompt,
    input.contextMessages ?? []
  );

  if (isTauri()) {
    try {
      const raw = await invoke<string | null>("agent_refine_prompt", {
        params: {
          baseUrl: input.baseUrl,
          apiKey: input.apiKey || null,
          apiKeySource: input.apiKeySource,
          apiKeyEnvVar: input.apiKeyEnvVar,
          model: input.model,
          userPrompt,
          systemPrompt,
          contextMessages: input.contextMessages ?? [],
        },
      });
      return raw ? normalizeRefinedPrompt(raw) || null : null;
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
      max_tokens: REFINE_MAX_TOKENS,
      temperature: 0.3,
      messages: [
        { role: "system", content: systemPrompt },
        { role: "user", content: userContent },
      ],
    }),
    signal: input.signal,
  });

  if (!response.ok) {
    return null;
  }

  return parseRefinedPromptFromCompletionBody(await response.json());
}

export async function refinePrompt(
  input: Omit<RefinePromptRequest, "systemPrompt"> & {
    labSettings?: LabSettings;
  }
): Promise<string | null> {
  const labSettings = input.labSettings ?? getLabSettingsSnapshot();
  return requestRefinedPrompt({
    ...input,
    systemPrompt: resolvePromptRefineSystemPrompt(labSettings),
  });
}
