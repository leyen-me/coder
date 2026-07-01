import { invoke, isTauri } from "@tauri-apps/api/core";

export type NormalizedWorkspaceReference = {
  path: string;
  name: string;
  isDir: boolean;
};

/**
 * Normalize an external (absolute) file path into a workspace-relative
 * reference with the path, display name, and directory flag.
 *
 * Used when dragging files from outside the workspace into the composer.
 */
export async function normalizeExternalPathForWorkspace(
  workspaceDir: string | null | undefined,
  absolutePath: string,
): Promise<NormalizedWorkspaceReference> {
  if (!isTauri()) {
    throw new Error("File operations are only available in the desktop app");
  }

  const trimmedWorkspaceDir = workspaceDir?.trim();
  return invoke<NormalizedWorkspaceReference>("tool_normalize_external_path", {
    workspaceDir: trimmedWorkspaceDir ? trimmedWorkspaceDir : null,
    absolutePath,
  });
}
