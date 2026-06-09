export const ROOT_PATH = ".";

export function normalizeTreePath(path: string): string {
  const trimmed = path.trim().replace(/\\/g, "/");
  return trimmed.length === 0 ? ROOT_PATH : trimmed;
}

export function parentTreePath(path: string): string {
  const normalized = normalizeTreePath(path);
  if (normalized === ROOT_PATH) {
    return ROOT_PATH;
  }

  const index = normalized.lastIndexOf("/");
  return index <= 0 ? ROOT_PATH : normalized.slice(0, index);
}

export function basenameTreePath(path: string): string {
  const normalized = normalizeTreePath(path);
  if (normalized === ROOT_PATH) {
    return ROOT_PATH;
  }

  const segments = normalized.split("/");
  return segments.at(-1) ?? normalized;
}

export function joinTreePath(base: string, name: string): string {
  const normalizedBase = normalizeTreePath(base);
  const trimmedName = name.trim().replace(/\\/g, "/");
  if (trimmedName.length === 0) {
    return normalizedBase;
  }
  if (normalizedBase === ROOT_PATH) {
    return trimmedName;
  }
  return `${normalizedBase}/${trimmedName}`;
}
