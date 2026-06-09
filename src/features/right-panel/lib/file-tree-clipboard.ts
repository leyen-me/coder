export type FileTreeClipboardEntry = {
  operation: "copy" | "cut";
  path: string;
  name: string;
  isDir: boolean;
};
