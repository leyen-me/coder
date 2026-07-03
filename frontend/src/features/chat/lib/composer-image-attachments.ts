import type { FileUIPart } from "ai";
import { nanoid } from "nanoid";

import {
  guessImageMimeType,
} from "@/lib/dnd/external-file-drop";

export function isBlobAttachmentUrl(url: string | undefined): boolean {
  return typeof url === "string" && url.startsWith("blob:");
}

export function createImageAttachmentFromFile(
  file: File
): FileUIPart & { id: string } {
  return {
    id: nanoid(),
    type: "file",
    filename: file.name,
    mediaType: file.type || guessImageMimeType(file.name),
    url: URL.createObjectURL(file),
  };
}

export async function imageFileFromAbsolutePath(
  _path: string
): Promise<File | null> {
  return null;
}
