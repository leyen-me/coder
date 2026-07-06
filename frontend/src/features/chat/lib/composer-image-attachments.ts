import type { FileUIPart } from "ai";
import { nanoid } from "nanoid";

import { apiPost } from "@/lib/api/client";
import {
  basenameFromPath,
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

type LocalImageBytesResponse = {
  bytes: number[];
  mimeType: string;
};

export async function imageFileFromAbsolutePath(
  path: string
): Promise<File | null> {
  const trimmed = path.trim();
  if (!trimmed) {
    return null;
  }

  try {
    const result = await apiPost<LocalImageBytesResponse>(
      "/api/read_local_image_bytes",
      { path: trimmed }
    );
    if (!result.bytes?.length) {
      return null;
    }

    const bytes = new Uint8Array(result.bytes);
    const mimeType = result.mimeType || guessImageMimeType(trimmed);
    return new File([bytes], basenameFromPath(trimmed), { type: mimeType });
  } catch {
    return null;
  }
}
