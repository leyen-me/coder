import { describe, expect, it } from "vitest";

import {
  parseToolCallInput,
  toolResultToInvocationPatch,
} from "@/features/agent/tools/tool-display";
import { toolFailure, toolSuccess } from "@/features/agent/tools/result";

describe("parseToolCallInput", () => {
  it("parses JSON arguments and falls back for invalid JSON", () => {
    expect(parseToolCallInput("{\"path\":\".\"}")).toEqual({ path: "." });
    expect(parseToolCallInput("")).toEqual({});
    expect(parseToolCallInput("{bad")).toEqual({ raw: "{bad" });
  });
});

describe("toolResultToInvocationPatch", () => {
  it("maps unified tool results to UI states", () => {
    expect(
      toolResultToInvocationPatch(
        toolSuccess("list_dir", { path: ".", entries: [] })
      )
    ).toEqual({
      state: "output-available",
      output: {
        ok: true,
        tool: "list_dir",
        data: { path: ".", entries: [] },
      },
    });

    expect(
      toolResultToInvocationPatch(
        toolFailure("list_dir", "workspace_required", "Select a workspace")
      )
    ).toEqual({
      state: "output-error",
      output: {
        ok: false,
        tool: "list_dir",
        error: {
          code: "workspace_required",
          message: "Select a workspace",
        },
      },
      errorText: "Select a workspace",
    });
  });
});
