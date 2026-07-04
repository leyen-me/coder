import { resolveDefaultWorkspacePath } from "./resolve-default-workspace-path";
import { openWorkspacePicker } from "./workspace-picker-store";

export async function pickWorkspaceDir(): Promise<string | null> {
  const defaultPath = await resolveDefaultWorkspacePath();
  return openWorkspacePicker(defaultPath);
}
