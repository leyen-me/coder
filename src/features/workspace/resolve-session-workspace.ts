import { readWorkspaceDir } from "./storage";

/** Workspace path snapshot used when creating a new session. */
export function resolveInitialSessionWorkspaceDir(): string | null {
  return readWorkspaceDir();
}
