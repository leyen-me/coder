import { describe, expect, it, vi } from "vitest";

import { ApiError, apiPost } from "./client";

describe("apiPost", () => {
  it("throws ApiError instead of SyntaxError for empty JSON bodies", async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn().mockResolvedValue({
        ok: true,
        status: 200,
        statusText: "OK",
        text: async () => "",
      })
    );

    await expect(apiPost("/api/shell_kill", { shellId: "x" })).rejects.toMatchObject({
      name: "ApiError",
      code: "empty_response",
    } satisfies Partial<ApiError>);

    vi.unstubAllGlobals();
  });
});
