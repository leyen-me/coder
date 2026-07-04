
import { apiPost } from "@/lib/api/client";

import { resolvePromptRefineSystemPrompt } from "./storage";
import { getLabSettingsSnapshot } from "./lab-settings-store";
import type { LabSettings } from "./types";

export const PROMPT_REFINE_TIMEOUT_MS = 60_000;
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

  try {
    const rawPrompt = await apiPost<string | null>(
      "/agent/refine_prompt",
      {
        baseUrl: input.baseUrl,
        apiKey: input.apiKey.trim() || null,
        apiKeySource: input.apiKeySource,
        apiKeyEnvVar: input.apiKeyEnvVar,
        model: input.model,
        userPrompt,
        systemPrompt,
        contextMessages: input.contextMessages ?? [],
      },
      input.signal
    );

    if (typeof rawPrompt !== "string") {
      return null;
    }

    return normalizeRefinedPrompt(rawPrompt) || null;
  } catch {
    return null;
  }
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
