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

const VERBATIM_PREFIX = "\\\\?\\";
const VERBATIM_UNC_PREFIX = "\\\\?\\UNC\\";
const VERBATIM_PREFIX_FORWARD = "//?/";
const VERBATIM_UNC_PREFIX_FORWARD = "//?/UNC/";

/** Strips the Windows verbatim path prefix from canonicalized absolute paths. */
export function stripWindowsVerbatimPrefix(path: string): string {
  const trimmed = path.trim();
  if (!trimmed) {
    return trimmed;
  }

  if (trimmed.startsWith(VERBATIM_UNC_PREFIX)) {
    return `\\\\${trimmed.slice(VERBATIM_UNC_PREFIX.length)}`;
  }

  if (trimmed.startsWith(VERBATIM_PREFIX)) {
    return trimmed.slice(VERBATIM_PREFIX.length);
  }

  if (trimmed.startsWith(VERBATIM_UNC_PREFIX_FORWARD)) {
    return `\\\\${trimmed.slice(VERBATIM_UNC_PREFIX_FORWARD.length)}`;
  }

  if (trimmed.startsWith(VERBATIM_PREFIX_FORWARD)) {
    return trimmed.slice(VERBATIM_PREFIX_FORWARD.length);
  }

  return trimmed;
}
