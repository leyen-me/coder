// Unified API client for Coder HTTP Server mode.
// Replaces all `invoke()` calls from @tauri-apps/api/core.

const API_BASE = window.location.origin;

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

export async function apiPost<T>(
  path: string,
  body?: unknown,
  signal?: AbortSignal,
): Promise<T> {
  const response = await fetch(`${API_BASE}${path}`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: body !== undefined ? JSON.stringify(body) : undefined,
    signal,
  });

  if (!response.ok) {
    const error = await response.json().catch(() => ({}));
    throw new ApiError(
      response.status,
      error.code || "unknown_error",
      error.message || response.statusText,
    );
  }

  return response.json();
}

export async function apiGet<T>(
  path: string,
  signal?: AbortSignal,
): Promise<T> {
  const response = await fetch(`${API_BASE}${path}`, {
    method: "GET",
    signal,
  });

  if (!response.ok) {
    const error = await response.json().catch(() => ({}));
    throw new ApiError(
      response.status,
      error.code || "unknown_error",
      error.message || response.statusText,
    );
  }

  return response.json();
}

export async function apiGetText(
  path: string,
  signal?: AbortSignal,
): Promise<string> {
  const response = await fetch(`${API_BASE}${path}`, { method: "GET", signal });
  if (!response.ok) {
    const error = await response.json().catch(() => ({}));
    throw new ApiError(
      response.status,
      error.code || "unknown_error",
      error.message || response.statusText,
    );
  }
  return response.text();
}
