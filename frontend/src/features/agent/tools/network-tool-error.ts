export type NetworkToolErrorPayload = {
  code: string;
  message: string;
};

export function parseNetworkToolError(
  error: unknown
): NetworkToolErrorPayload | null {
  if (typeof error === "string") {
    return parseNetworkToolErrorPayload(error);
  }

  if (error instanceof Error) {
    const fromMessage = parseNetworkToolErrorPayload(error.message);
    if (fromMessage) {
      return fromMessage;
    }
  }

  return parseNetworkToolErrorPayload(error);
}

function parseNetworkToolErrorPayload(
  raw: unknown
): NetworkToolErrorPayload | null {
  const parsed =
    typeof raw === "string"
      ? parseJsonNetworkToolError(raw)
      : isNetworkToolErrorPayload(raw)
        ? raw
        : null;

  if (!parsed) {
    return null;
  }

  return parsed;
}

function parseJsonNetworkToolError(raw: string): NetworkToolErrorPayload | null {
  try {
    const parsed = JSON.parse(raw) as unknown;
    return isNetworkToolErrorPayload(parsed) ? parsed : null;
  } catch {
    return null;
  }
}

function isNetworkToolErrorPayload(
  value: unknown
): value is NetworkToolErrorPayload {
  if (typeof value !== "object" || value === null) {
    return false;
  }

  const record = value as Record<string, unknown>;
  return (
    typeof record.code === "string" && typeof record.message === "string"
  );
}
