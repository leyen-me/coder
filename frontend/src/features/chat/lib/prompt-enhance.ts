import type { ApiKeySource } from "@/lib/model-provider/types";

/**
 * System prompt instructing the model to rewrite/improve the user's prompt.
 * Mirrors the backend `ENHANCE_PROMPT_SYSTEM_PROMPT` default so the frontend
 * can tune the instruction without a backend change.
 */
export const PROMPT_ENHANCE_SYSTEM_PROMPT = `You are an expert prompt engineer. Your task is to rewrite and improve the user's prompt so that an AI assistant can produce a higher-quality response.

Improvement guidelines:
- Clarify the user's true intent and make the request specific and unambiguous.
- Add helpful structure (steps, constraints, output format, or context) when it improves clarity.
- Keep the original meaning, language, and tone of the user's prompt.
- Do not add commentary, explanations, or preamble.

Output ONLY the improved prompt text. Do not wrap it in markdown code fences or quotes.`;

export type EnhancePromptRequest = {
  baseUrl: string;
  apiKey: string;
  apiKeySource: ApiKeySource;
  apiKeyEnvVar: string;
  model: string;
  userPrompt: string;
  systemPrompt: string;
};

export type EnhancePromptOptions = {
  /** Called for every streamed text delta. */
  onDelta: (delta: string) => void;
  /** Aborting this signal pauses the streaming output. */
  signal: AbortSignal;
};

/**
 * Stream a prompt enhancement from the backend. The backend emits SSE events of
 * the form `data: {"type":"delta","text":"..."}` and finishes with
 * `data: {"type":"done"}` (or `{"type":"error","message":"..."}` on failure).
 */
export async function streamEnhancePrompt(
  input: EnhancePromptRequest,
  options: EnhancePromptOptions
): Promise<void> {
  const response = await fetch("/api/agent/enhance_prompt", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      baseUrl: input.baseUrl,
      apiKey: input.apiKey || "",
      apiKeySource: input.apiKeySource,
      apiKeyEnvVar: input.apiKeyEnvVar,
      model: input.model,
      userPrompt: input.userPrompt,
      systemPrompt: input.systemPrompt,
    }),
    signal: options.signal,
  });

  if (!response.ok || !response.body) {
    throw new Error(`Enhance prompt failed: ${response.status}`);
  }

  const reader = response.body.getReader();
  const decoder = new TextDecoder();
  let buffer = "";

  const drainBlocks = (): string[] => {
    const events: string[] = [];
    let rest = buffer.replace(/\r\n/g, "\n");
    while (true) {
      const index = rest.indexOf("\n\n");
      if (index === -1) {
        break;
      }
      events.push(rest.slice(0, index));
      rest = rest.slice(index + 2);
    }
    buffer = rest;
    return events;
  };

  while (true) {
    const { done, value } = await reader.read();
    if (done) {
      break;
    }
    buffer += decoder.decode(value, { stream: true });

    for (const block of drainBlocks()) {
      const payload = readSsePayload(block);
      if (!payload) {
        continue;
      }
      let data: { type?: string; text?: unknown; message?: unknown };
      try {
        data = JSON.parse(payload);
      } catch {
        continue;
      }

      switch (data.type) {
        case "delta":
          if (typeof data.text === "string") {
            options.onDelta(data.text);
          }
          break;
        case "error":
          throw new Error(
            typeof data.message === "string"
              ? data.message
              : "Enhance prompt error"
          );
        case "done":
          return;
        default:
          // Ignore "heartbeat" and any unknown event types.
          break;
      }
    }
  }
}

function readSsePayload(block: string): string | null {
  const dataLines: string[] = [];
  for (const rawLine of block.split("\n")) {
    const line = rawLine.trimEnd();
    if (!line || line.startsWith(":")) {
      continue;
    }
    if (line.startsWith("data:")) {
      dataLines.push(line.slice(5).trimStart());
    }
  }
  if (dataLines.length === 0) {
    return null;
  }
  return dataLines.join("\n");
}

/**
 * Light cleanup of the enhanced prompt: trims whitespace and strips a single
 * surrounding triple-backtick code fence (some models add one despite the
 * instruction not to).
 */
export function normalizeEnhancedPrompt(raw: string): string {
  let text = raw.trim();
  const fence = text.match(/^```[a-zA-Z0-9]*\n([\s\S]*?)\n```$/);
  if (fence) {
    text = fence[1].trim();
  }
  return text;
}
