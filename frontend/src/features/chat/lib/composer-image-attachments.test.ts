import { describe, expect, it, vi } from "vitest";

vi.mock("@/lib/api/client", () => ({
  apiPost: vi.fn(),
}));

import { apiPost } from "@/lib/api/client";

import { imageFileFromAbsolutePath } from "./composer-image-attachments";

describe("imageFileFromAbsolutePath", () => {
  it("builds a File from backend image bytes", async () => {
    vi.mocked(apiPost).mockResolvedValueOnce({
      bytes: [0xff, 0xd8, 0xff, 0xd9],
      mimeType: "image/jpeg",
    });

    const file = await imageFileFromAbsolutePath("/tmp/photo.jpg");

    expect(apiPost).toHaveBeenCalledWith("/api/read_local_image_bytes", {
      path: "/tmp/photo.jpg",
    });
    expect(file).toBeInstanceOf(File);
    expect(file?.name).toBe("photo.jpg");
    expect(file?.type).toBe("image/jpeg");
  });

  it("returns null when the backend request fails", async () => {
    vi.mocked(apiPost).mockRejectedValueOnce(new Error("not found"));

    await expect(imageFileFromAbsolutePath("/tmp/missing.png")).resolves.toBeNull();
  });
});
