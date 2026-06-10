import { invoke, isTauri } from "@tauri-apps/api/core";

type PathOperationResult = {
  path: string;
  action: string;
};

function assertTauri(): void {
  if (!isTauri()) {
    throw new Error("File operations are only available in the desktop app");
  }
}

export async function deleteWorkspacePath(
  workspaceDir: string,
  path: string,
  recursive?: boolean
): Promise<PathOperationResult> {
  assertTauri();
  return invoke<PathOperationResult>("tool_delete_path", {
    workspaceDir,
    path,
    recursive,
  });
}

export async function renameWorkspacePath(
  workspaceDir: string,
  path: string,
  newName: string
): Promise<PathOperationResult> {
  assertTauri();
  return invoke<PathOperationResult>("tool_rename_path", {
    workspaceDir,
    path,
    newName,
  });
}

export async function createWorkspaceDir(
  workspaceDir: string,
  path: string
): Promise<PathOperationResult> {
  assertTauri();
  return invoke<PathOperationResult>("tool_create_dir", {
    workspaceDir,
    path,
  });
}

export async function copyWorkspacePath(
  workspaceDir: string,
  sourcePath: string,
  destPath: string
): Promise<PathOperationResult> {
  assertTauri();
  return invoke<PathOperationResult>("tool_copy_path", {
    workspaceDir,
    sourcePath,
    destPath,
  });
}

export async function moveWorkspacePath(
  workspaceDir: string,
  sourcePath: string,
  destPath: string
): Promise<PathOperationResult> {
  assertTauri();
  return invoke<PathOperationResult>("tool_move_path", {
    workspaceDir,
    sourcePath,
    destPath,
  });
}

export async function createWorkspaceFile(
  workspaceDir: string,
  path: string
): Promise<PathOperationResult> {
  assertTauri();
  return invoke<PathOperationResult>("tool_write_file", {
    workspaceDir,
    path,
    content: "",
    createParentDirs: true,
  });
}

export async function resolveWorkspaceAbsolutePath(
  workspaceDir: string,
  path: string
): Promise<string> {
  assertTauri();
  return invoke<string>("tool_resolve_absolute_path", {
    workspaceDir,
    path,
  });
}

export type NormalizedWorkspaceReference = {
  path: string;
  name: string;
  isDir: boolean;
};

export async function normalizeExternalPathForWorkspace(
  workspaceDir: string,
  absolutePath: string
): Promise<NormalizedWorkspaceReference> {
  assertTauri();
  return invoke<NormalizedWorkspaceReference>("tool_normalize_external_path", {
    workspaceDir,
    absolutePath,
  });
}
