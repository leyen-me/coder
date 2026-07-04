import { readWorkspaceDir } from "./storage";

/** Resolves the default path shown when opening the workspace picker. */
export async function resolveDefaultWorkspacePath(): Promise<string> {
  return readWorkspaceDir()?.trim() ?? "";
}
