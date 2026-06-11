import type { ToolResultEnvelope } from "./result";

export function parseToolCallInput(rawArguments: string): unknown {
  const trimmed = rawArguments.trim();
  if (!trimmed) {
    return {};
  }

  try {
    return JSON.parse(trimmed) as unknown;
  } catch {
    return { raw: rawArguments };
  }
}

/** Ensure tool call arguments are valid JSON before sending to chat completion APIs. */
export function sanitizeToolCallArguments(rawArguments: string): string {
  const trimmed = rawArguments.trim();
  if (!trimmed) {
    return "{}";
  }

  try {
    JSON.parse(trimmed);
    return trimmed;
  } catch {
    return JSON.stringify({ raw: rawArguments });
  }
}

export function toolResultToInvocationPatch(result: ToolResultEnvelope): {
  state: "output-available" | "output-error";
  output: ToolResultEnvelope;
  errorText?: string;
} {
  if (result.ok) {
    return {
      state: "output-available",
      output: result,
    };
  }

  return {
    state: "output-error",
    output: result,
    errorText: result.error.message,
  };
}
