import { describe, expect, it } from "vitest";

import {
  serializeToolResult,
  toolFailure,
  toolSuccess,
} from "@/features/agent/tools/result";

describe("tool result envelope", () => {
  it("serializes success and failure in a unified shape", () => {
    expect(
      JSON.parse(
        serializeToolResult(
          toolSuccess("list_dir", {
            path: ".",
            entries: [],
          })
        )
      )
    ).toEqual({
      ok: true,
      tool: "list_dir",
      data: { path: ".", entries: [] },
    });

    expect(
      JSON.parse(
        serializeToolResult(
          toolFailure("list_dir", "workspace_required", "Select a workspace")
        )
      )
    ).toEqual({
      ok: false,
      tool: "list_dir",
      error: {
        code: "workspace_required",
        message: "Select a workspace",
      },
    });
  });
});
