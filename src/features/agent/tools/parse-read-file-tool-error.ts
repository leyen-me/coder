import type { ReadFileToolErrorPayload } from "./types";

export function parseReadFileToolError(
  error: unknown
): ReadFileToolErrorPayload | null {
  if (typeof error === "string") {
    return parseReadFileToolErrorPayload(error);
  }

  if (error instanceof Error) {
    const fromMessage = parseReadFileToolErrorPayload(error.message);
    if (fromMessage) {
      return fromMessage;
    }
  }

  return parseReadFileToolErrorPayload(error);
}

function parseReadFileToolErrorPayload(
  raw: unknown
): ReadFileToolErrorPayload | null {
  const parsed =
    typeof raw === "string"
      ? parseJsonReadFileToolError(raw)
      : isReadFileToolErrorPayload(raw)
        ? raw
        : null;

  if (!parsed) {
    return null;
  }

  return {
    code: parsed.code,
    message: parsed.message,
    mimeType: parsed.mimeType,
    size: parsed.size,
  };
}

function parseJsonReadFileToolError(
  raw: string
): ReadFileToolErrorPayload | null {
  try {
    const parsed = JSON.parse(raw) as unknown;
    return isReadFileToolErrorPayload(parsed) ? parsed : null;
  } catch {
    return null;
  }
}

function isReadFileToolErrorPayload(
  value: unknown
): value is ReadFileToolErrorPayload {
  if (typeof value !== "object" || value === null) {
    return false;
  }

  const record = value as Record<string, unknown>;
  return (
    typeof record.code === "string" && typeof record.message === "string"
  );
}
