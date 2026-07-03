import { invoke, isTauri } from "@tauri-apps/api/core";
import type { FileUIPart } from "ai";
import { nanoid } from "nanoid";

import {
  basenameFromPath,
  guessImageMimeType,
} from "@/lib/dnd/external-file-drop";

type LocalImageBytes = {
  bytes: number[];
  mimeType: string;
};

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
  path: string
): Promise<File | null> {
  if (!isTauri()) {
    return null;
  }

  try {
    const result = await invoke<LocalImageBytes>("tool_read_local_image_bytes", {
      path,
    });
    const bytes = Uint8Array.from(result.bytes);
    const filename = basenameFromPath(path);
    const mimeType = result.mimeType || guessImageMimeType(path);

    return new File([bytes], filename, { type: mimeType });
  } catch {
    return null;
  }
}
