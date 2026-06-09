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

export function withCopySuffix(name: string): string {
  const dotIndex = name.lastIndexOf(".");
  if (dotIndex > 0) {
    return `${name.slice(0, dotIndex)} copy${name.slice(dotIndex)}`;
  }
  return `${name} copy`;
}

export function withNumberedSuffix(name: string, index: number): string {
  const dotIndex = name.lastIndexOf(".");
  if (dotIndex > 0) {
    const stem = name.slice(0, dotIndex);
    const ext = name.slice(dotIndex);
    return `${stem} (${index})${ext}`;
  }
  return `${name} (${index})`;
}

export function resolvePasteDestinationPath(
  folderPath: string,
  sourcePath: string,
  name: string,
  operation: "copy" | "cut"
): string | null {
  const normalizedFolder = normalizeTreePath(folderPath);
  const normalizedSource = normalizeTreePath(sourcePath);
  let destName = name;
  let destPath = joinTreePath(normalizedFolder, destName);
  let normalizedDest = normalizeTreePath(destPath);

  if (operation === "cut") {
    if (normalizedDest === normalizedSource) {
      return null;
    }
    return destPath;
  }

  if (normalizedDest === normalizedSource) {
    destName = withCopySuffix(name);
    destPath = joinTreePath(normalizedFolder, destName);
    normalizedDest = normalizeTreePath(destPath);
  }

  return destPath;
}
