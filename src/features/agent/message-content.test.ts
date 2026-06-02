import type { FileUIPart } from "ai";
import { describe, expect, it } from "vitest";

import {
  buildUserAgentContent,
  fileUIPartsToStoredImages,
  hasAgentMessageContent,
} from "@/features/agent/message-content";

describe("buildUserAgentContent", () => {
  it("returns plain text when there are no images", () => {
    expect(buildUserAgentContent("hello", [])).toBe("hello");
  });

  it("builds OpenAI multimodal parts for text and images", () => {
    const content = buildUserAgentContent("see this", [
      {
        id: "img-1",
        url: "data:image/png;base64,abc",
        mediaType: "image/png",
      },
    ]);

    expect(content).toEqual([
      { type: "text", text: "see this" },
      {
        type: "image_url",
        image_url: { url: "data:image/png;base64,abc", detail: "auto" },
      },
    ]);
  });

  it("supports image-only user messages", () => {
    const content = buildUserAgentContent("", [
      {
        id: "img-1",
        url: "data:image/jpeg;base64,xyz",
        mediaType: "image/jpeg",
      },
    ]);

    expect(content).toEqual([
      {
        type: "image_url",
        image_url: { url: "data:image/jpeg;base64,xyz", detail: "auto" },
      },
    ]);
    expect(hasAgentMessageContent(content)).toBe(true);
  });
});

describe("fileUIPartsToStoredImages", () => {
  it("keeps only image file parts", () => {
    const files: FileUIPart[] = [
      {
        type: "file",
        url: "data:image/png;base64,a",
        mediaType: "image/png",
        filename: "a.png",
      },
      {
        type: "file",
        url: "data:application/pdf;base64,b",
        mediaType: "application/pdf",
        filename: "b.pdf",
      },
    ];

    expect(fileUIPartsToStoredImages(files)).toHaveLength(1);
    expect(fileUIPartsToStoredImages(files)[0]?.filename).toBe("a.png");
  });
});
