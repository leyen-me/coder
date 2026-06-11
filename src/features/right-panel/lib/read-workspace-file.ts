import { invoke, isTauri } from "@tauri-apps/api/core";

export type EditorFileData = {
  path: string;
  encoding: string;
  mimeType: string;
  sha256: string;
  totalLines: number;
  containsSecrets: boolean;
  content: string;
};

export async function readWorkspaceFile(
  workspaceDir: string,
  path: string
): Promise<EditorFileData> {
  if (!isTauri()) {
    throw new Error("read_file is only available in the desktop app");
  }

  return invoke<EditorFileData>("tool_read_editor_file", {
    workspaceDir,
    path,
    respectGitignore: true,
  });
}
