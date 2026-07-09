import { apiPost, ApiError } from "@/lib/api/client";

export async function openPathInExplorer(
  path: string
): Promise<{ ok: true } | { ok: false; message: string }> {
  const trimmed = path.trim();
  if (!trimmed) {
    return { ok: false, message: "path is required" };
  }

  try {
    await apiPost<{ ok: true }>("/api/open_in_explorer", { path: trimmed });
    return { ok: true };
  } catch (error) {
    if (error instanceof ApiError) {
      return { ok: false, message: error.message };
    }
    throw error;
  }
}
