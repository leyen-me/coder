import { apiPost, ApiError } from "@/lib/api/client";

type ValidateWorkspaceDirResponse = {
  path: string;
};

export async function validateWorkspaceDir(
  path: string
): Promise<{ ok: true; path: string } | { ok: false; message: string }> {
  const trimmed = path.trim();
  if (!trimmed) {
    return { ok: false, message: "workspaceDir is required" };
  }

  try {
    const result = await apiPost<ValidateWorkspaceDirResponse>(
      "/api/validate_workspace_dir",
      { path: trimmed }
    );
    return { ok: true, path: result.path };
  } catch (error) {
    if (error instanceof ApiError) {
      return { ok: false, message: error.message };
    }
    throw error;
  }
}
