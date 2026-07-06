import { describe, expect, it, vi } from "vitest";

vi.mock("./composer-image-attachments", () => ({
  imageFileFromAbsolutePath: vi.fn(),
}));

import { imageFileFromAbsolutePath } from "./composer-image-attachments";
import { processNativeFileDropItems } from "./process-native-file-drop-items";

const messages = {
  externalDropImageLoadFailed: "image load failed",
  externalDropInvalidPath: "invalid path",
  externalDropPathUnresolved: "path unresolved",
  externalDropUnsupportedRuntime: "unsupported runtime",
};

describe("processNativeFileDropItems", () => {
  it("loads image attachments from absolute paths without File objects", async () => {
    const imageFile = new File(["x"], "photo.png", { type: "image/png" });
    vi.mocked(imageFileFromAbsolutePath).mockResolvedValueOnce(imageFile);
    const addAttachments = vi.fn();
    const onError = vi.fn();

    await processNativeFileDropItems({
      items: [{ path: "/tmp/photo.png" }],
      addAttachments,
      onError,
      messages,
    });

    expect(imageFileFromAbsolutePath).toHaveBeenCalledWith("/tmp/photo.png");
    expect(addAttachments).toHaveBeenCalledWith([imageFile]);
    expect(onError).not.toHaveBeenCalled();
  });

  it("reports image load failures separately from unresolved paths", async () => {
    vi.mocked(imageFileFromAbsolutePath).mockResolvedValueOnce(null);
    const onError = vi.fn();

    await processNativeFileDropItems({
      items: [{ path: "/tmp/photo.png" }],
      addAttachments: vi.fn(),
      onError,
      messages,
    });

    expect(onError).toHaveBeenCalledWith(messages.externalDropImageLoadFailed);
  });
});
