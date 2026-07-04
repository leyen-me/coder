// Unified API client for Coder HTTP Server mode.
// Replaces all `invoke()` calls from @tauri-apps/api/core.

function getApiBase(): string {
  if (typeof window === "undefined") {
    return "";
  }
  return window.location.origin;
}

export class ApiError extends Error {
  public status: number;
  public code: string;

  constructor(status: number, code: string, message: string) {
    super(message);
    this.name = "ApiError";
    this.status = status;
    this.code = code;
  }
}

type ParsedApiError = {
  code?: string;
  message?: string;
};

function parseApiErrorBody(raw: string): ParsedApiError {
  const trimmed = raw.trim();
  if (!trimmed) {
    return {};
  }

  try {
    const parsed = JSON.parse(trimmed) as unknown;
    if (typeof parsed === "object" && parsed !== null) {
      const record = parsed as Record<string, unknown>;
      return {
        code: typeof record.code === "string" ? record.code : undefined,
        message: typeof record.message === "string" ? record.message : undefined,
      };
    }
  } catch {
    // Fall through to plain-text parsing.
  }

  const match = trimmed.match(/^\[([^\]]+)\]\s*(.*)$/s);
  if (match) {
    return {
      code: match[1],
      message: match[2]?.trim() || trimmed,
    };
  }

  return { message: trimmed };
}

async function readResponseBody(response: Response): Promise<string> {
  if (typeof response.text === "function") {
    return response.text();
  }

  if (typeof response.json === "function") {
    try {
      return JSON.stringify(await response.json());
    } catch {
      return "";
    }
  }

  return "";
}

async function readApiError(response: Response): Promise<ApiError> {
  const parsed = parseApiErrorBody(await readResponseBody(response));
  return new ApiError(
    response.status,
    parsed.code || "unknown_error",
    parsed.message || response.statusText,
  );
}

export async function apiPost<T>(
  path: string,
  body?: unknown,
  signal?: AbortSignal,
): Promise<T> {
  const response = await fetch(`${getApiBase()}${path}`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: body !== undefined ? JSON.stringify(body) : undefined,
    signal,
  });

  if (!response.ok) {
    throw await readApiError(response);
  }

  return response.json();
}

export async function apiGet<T>(
  path: string,
  signal?: AbortSignal,
): Promise<T> {
  const response = await fetch(`${getApiBase()}${path}`, {
    method: "GET",
    signal,
  });

  if (!response.ok) {
    throw await readApiError(response);
  }

  return response.json();
}

export async function apiGetText(
  path: string,
  signal?: AbortSignal,
): Promise<string> {
  const response = await fetch(`${getApiBase()}${path}`, { method: "GET", signal });
  if (!response.ok) {
    throw await readApiError(response);
  }
  return response.text();
}
