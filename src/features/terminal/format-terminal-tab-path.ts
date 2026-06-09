function normalizePath(path: string): string {
  return path.replace(/\\/g, "/").replace(/\/+$/, "");
}

export function formatTerminalTabPath(
  cwd: string,
  homeDirectory: string | null = null
): string {
  const normalizedCwd = normalizePath(cwd);

  if (!homeDirectory) {
    return normalizedCwd;
  }

  const normalizedHome = normalizePath(homeDirectory);

  if (normalizedCwd === normalizedHome) {
    return "~";
  }

  const homePrefix = `${normalizedHome}/`;
  if (normalizedCwd.startsWith(homePrefix)) {
    return `~${normalizedCwd.slice(normalizedHome.length)}`;
  }

  return normalizedCwd;
}
