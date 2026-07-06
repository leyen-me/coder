const IMAGE_EXTENSIONS = new Set([
  "avif",
  "bmp",
  "gif",
  "heic",
  "heif",
  "jpeg",
  "jpg",
  "png",
  "svg",
  "webp",
]);

const IMAGE_MIME_BY_EXTENSION: Record<string, string> = {
  avif: "image/avif",
  bmp: "image/bmp",
  gif: "image/gif",
  heic: "image/heic",
  heif: "image/heif",
  jpeg: "image/jpeg",
  jpg: "image/jpeg",
  png: "image/png",
  svg: "image/svg+xml",
  webp: "image/webp",
};

export function hasExtractableExternalPaths(dataTransfer: DataTransfer): boolean {
  return extractAbsolutePathsFromDataTransfer(dataTransfer).length > 0;
}

export function extractAbsolutePathsFromDataTransfer(
  dataTransfer: DataTransfer
): string[] {
  const paths: string[] = [];

  const uriList = dataTransfer.getData("text/uri-list");
  if (uriList) {
    for (const line of uriList.split(/\r?\n/)) {
      const trimmed = line.trim();
      if (!trimmed || trimmed.startsWith("#")) {
        continue;
      }

      const path = fileUriToPath(trimmed);
      if (path) {
        paths.push(path);
      }
    }
  }

  if (paths.length === 0) {
    const plain = dataTransfer.getData("text/plain").trim();
    if (looksLikeAbsolutePath(plain)) {
      paths.push(plain);
    }
  }

  return [...new Set(paths)];
}

export function fileUriToPath(uri: string): string | null {
  if (!uri.startsWith("file://")) {
    return null;
  }

  try {
    const url = new URL(uri);
    let path = decodeURIComponent(url.pathname);

    // Windows: /C:/Users/... → C:/Users/...
    if (/^\/[A-Za-z]:\//.test(path)) {
      path = path.slice(1);
    }

    return path || null;
  } catch {
    return null;
  }
}

export function looksLikeAbsolutePath(value: string): boolean {
  if (!value) {
    return false;
  }

  if (value.startsWith("/")) {
    return true;
  }

  return /^[A-Za-z]:[\\/]/.test(value);
}

export function isImageFile(file: File): boolean {
  if (file.type.startsWith("image/")) {
    return true;
  }

  return isImagePath(file.name);
}

export function isImagePath(path: string): boolean {
  const extension = path.split(".").pop()?.toLowerCase();
  return extension ? IMAGE_EXTENSIONS.has(extension) : false;
}

export function basenameFromPath(path: string): string {
  const segments = path.split(/[/\\]/);
  return segments.at(-1) ?? path;
}

export function guessImageMimeType(path: string): string {
  const extension = path.split(".").pop()?.toLowerCase();
  if (!extension) {
    return "image/png";
  }

  return IMAGE_MIME_BY_EXTENSION[extension] ?? "image/png";
}

export type NativeFileDropItem = {
  path?: string;
  file?: File;
};

export function collectNativeFileDropItems(
  dataTransfer: DataTransfer
): NativeFileDropItem[] {
  const paths = extractAbsolutePathsFromDataTransfer(dataTransfer);
  const files = dataTransfer.files ? [...dataTransfer.files] : [];

  if (paths.length > 0) {
    const unmatchedFiles = [...files];
    return paths.map((path) => {
      const pathBasename = basenameFromPath(path).toLowerCase();
      const matchedIndex = unmatchedFiles.findIndex(
        (file) => file.name.toLowerCase() === pathBasename
      );
      if (matchedIndex >= 0) {
        const [file] = unmatchedFiles.splice(matchedIndex, 1);
        return { path, file };
      }

      const file = unmatchedFiles.shift();
      return { path, file };
    });
  }

  return files.map((file) => ({ file }));
}
