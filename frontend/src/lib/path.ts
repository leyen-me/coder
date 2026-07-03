/**
 * Extract the last segment (basename) from a POSIX-style path.
 *
 * Examples:
 *   basenameTreePath("src/lib/path.ts")  → "path.ts"
 *   basenameTreePath(".")                → "."
 *   basenameTreePath("root")             → "root"
 */
export function basenameTreePath(path: string): string {
  const normalized = path.trim().replace(/\\/g, "/");
  if (!normalized || normalized === ".") {
    return ".";
  }

  const segments = normalized.split("/");
  return segments.at(-1) ?? normalized;
}
