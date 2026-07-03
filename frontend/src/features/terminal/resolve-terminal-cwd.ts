export async function resolveHomeDirectory(): Promise<string | null> {
  // In browser mode, we don't have direct access to the home directory.
  // Use the workspace dir as-is or return null.
  return null;
}

export async function resolveTerminalCwd(
  workspaceDir: string | null
): Promise<string | null> {
  const trimmedWorkspace = workspaceDir?.trim();
  if (trimmedWorkspace) {
    return trimmedWorkspace;
  }

  return resolveHomeDirectory();
}
