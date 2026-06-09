export type FileTreeClipboardEntry = {
  operation: "copy" | "cut";
  path: string;
  name: string;
  isDir: boolean;
};

let clipboard: FileTreeClipboardEntry | null = null;

export function getFileTreeClipboard(): FileTreeClipboardEntry | null {
  return clipboard;
}

export function setFileTreeClipboard(entry: FileTreeClipboardEntry): void {
  clipboard = entry;
}

export function clearFileTreeClipboard(): void {
  clipboard = null;
}
