import { beforeEach, describe, expect, it, vi } from "vitest";

vi.mock("@/lib/api/client", () => ({
  ApiError: class ApiError extends Error {
    constructor(
      public status: number,
      public code: string,
      message: string
    ) {
      super(message);
    }
  },
  apiPost: vi.fn(),
}));

import { apiPost } from "@/lib/api/client";
import { readWorkspaceTextFile } from "./handoff-workspace";

describe("handoff-workspace", () => {
  beforeEach(() => {
    vi.mocked(apiPost).mockReset();
  });

  it("reads long workspace files across multiple pages", async () => {
    vi.mocked(apiPost)
      .mockResolvedValueOnce({
        path: ".agent/sessions/s1/history.md",
        sha256: "abc",
        totalLines: 1500,
        startLine: 1,
        endLine: 1000,
        truncated: true,
        containsSecrets: false,
        encoding: "utf-8",
        mimeType: "text/plain",
        content: "part-1",
      })
      .mockResolvedValueOnce({
        path: ".agent/sessions/s1/history.md",
        sha256: "abc",
        totalLines: 1500,
        startLine: 1001,
        endLine: 1500,
        truncated: false,
        containsSecrets: false,
        encoding: "utf-8",
        mimeType: "text/plain",
        content: "part-2",
      });

    const result = await readWorkspaceTextFile("/workspace", ".agent/sessions/s1/history.md");

    expect(result).toEqual({
      path: ".agent/sessions/s1/history.md",
      sha256: "abc",
      content: "part-1\npart-2",
    });
    expect(vi.mocked(apiPost)).toHaveBeenNthCalledWith(
      2,
      "/api/read_file",
      expect.objectContaining({ startLine: 1001 })
    );
  });
});
