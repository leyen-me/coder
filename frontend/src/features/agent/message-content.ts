import type { FileUIPart } from "ai";

import { generateId } from "@/lib/generate-id";
import type { MessageImageAttachment } from "@/lib/db";

/** OpenAI Chat Completions user content part (multimodal). */
export type AgentTextContentPart = {
  type: "text";
  text: string;
};

export type AgentImageUrlContentPart = {
  type: "image_url";
  image_url: {
    url: string;
    detail?: "auto" | "low" | "high";
  };
};

export type AgentUserContentPart =
  | AgentTextContentPart
  | AgentImageUrlContentPart;

export type AgentMessageContent = string | AgentUserContentPart[];

export function isImageFileUIPart(file: FileUIPart): boolean {
  return (
    file.type === "file" &&
    Boolean(file.mediaType?.startsWith("image/")) &&
    Boolean(file.url?.trim())
  );
}

export function fileUIPartsToStoredImages(
  files: readonly FileUIPart[]
): MessageImageAttachment[] {
  return files.filter(isImageFileUIPart).map((file) => ({
    id: generateId(),
    filename: file.filename,
    mediaType: file.mediaType,
    url: file.url!,
  }));
}

export function storedImagesToFileUIParts(
  images: readonly MessageImageAttachment[]
): (FileUIPart & { id: string })[] {
  return images
    .filter((image) => image.url.trim())
    .map((image) => ({
      id: image.id,
      type: "file" as const,
      url: image.url,
      filename: image.filename,
      mediaType: image.mediaType ?? "application/octet-stream",
    }));
}

export function buildUserAgentContent(
  text: string,
  images: readonly MessageImageAttachment[]
): AgentMessageContent {
  const trimmed = text.trim();
  const validImages = images.filter((image) => image.url.trim());

  if (validImages.length === 0) {
    return trimmed;
  }

  const parts: AgentUserContentPart[] = [];
  if (trimmed) {
    parts.push({ type: "text", text: trimmed });
  }

  for (const image of validImages) {
    parts.push({
      type: "image_url",
      image_url: { url: image.url, detail: "auto" },
    });
  }

  return parts;
}

export function hasAgentMessageContent(
  content: AgentMessageContent | undefined
): boolean {
  if (content === undefined) {
    return false;
  }

  if (typeof content === "string") {
    return content.trim().length > 0;
  }

  return content.length > 0;
}
