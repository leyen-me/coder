// Unified HTTP API client for the Coder backend.

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

async function readJsonResponse<T>(response: Response): Promise<T> {
  const body = await readResponseBody(response);
  if (!body.trim()) {
    throw new ApiError(
      response.status,
      "empty_response",
      "Response body is empty",
    );
  }

  try {
    return JSON.parse(body) as T;
  } catch {
    throw new ApiError(
      response.status,
      "invalid_json",
      "Response body is not valid JSON",
    );
  }
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

  return readJsonResponse<T>(response);
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

  return readJsonResponse<T>(response);
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

// ── Auth helpers ────────────────────────────────────────────────────────

/** Check whether the current session is authenticated. */
export async function apiAuthStatus(): Promise<{ authenticated: boolean }> {
  const response = await fetch(`${getApiBase()}/api/auth/status`, {
    method: "GET",
  });
  if (!response.ok) {
    return { authenticated: false };
  }
  return response.json();
}

/** Submit the password for login. Returns true on success. */
export async function apiLogin(password: string): Promise<boolean> {
  const response = await fetch(`${getApiBase()}/api/auth/login`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ password }),
  });
  return response.ok;
}
