export async function pickWorkspaceDir(): Promise<string | null> {
  // Workspace directory selection is managed by the server in browser mode.
  return null;
}
