import { describe, expect, it, vi } from "vitest";

vi.mock("@/lib/api/client", () => ({
  apiPost: vi.fn(),
}));

import { apiPost } from "@/lib/api/client";
import { GREP_TOOL_NAME } from "./definitions";
import { grepHandler } from "./grep";
import { toolFailure, toolSuccess } from "./result";


describe("grepHandler", () => {
  it("requires a workspace directory", async () => {
    const result = await grepHandler(
      { pattern: "executeToolCall" },
      { workspaceDir: null }
    );
    expect(result).toEqual(
      toolFailure(
        GREP_TOOL_NAME,
        "workspace_required",
        "Select a workspace directory before searching files"
      )
    );
  });

  it("requires pattern in arguments", async () => {
    const result = await grepHandler({}, { workspaceDir: "/tmp/project" });
    expect(result).toEqual(
      toolFailure(
        GREP_TOOL_NAME,
        "invalid_arguments",
        "pattern is required and must be a non-empty string"
      )
    );
  });

  it("validates output_mode", async () => {
    const result = await grepHandler(
      { pattern: "foo", output_mode: "invalid" },
      { workspaceDir: "/tmp/project" }
    );
    expect(result).toEqual(
      toolFailure(
        GREP_TOOL_NAME,
        "invalid_arguments",
        "output_mode must be content, files_with_matches, or count"
      )
    );
  });

  it("returns successful grep results", async () => {
    vi.mocked(apiPost).mockResolvedValueOnce({
      pattern: "executeToolCall",
      path: "/tmp/project/src",
      outputMode: "content",
      matches: [
        {
          path: "src/features/agent/agent-loop.ts",
          lineNumber: 181,
          line: "    const result = await executeToolCall(call.name, call.arguments, {",
        },
      ],
      totalMatches: 1,
      truncated: false,
    });

    const result = await grepHandler(
      {
        pattern: "executeToolCall",
        path: "src/features/agent",
        output_mode: "content",
        context: 1,
      },
      { workspaceDir: "/tmp/project" }
    );

    expect(result).toEqual(
      toolSuccess(GREP_TOOL_NAME, {
        pattern: "executeToolCall",
        path: "/tmp/project/src",
        outputMode: "content",
        matches: [
          {
            path: "src/features/agent/agent-loop.ts",
            lineNumber: 181,
            line: "    const result = await executeToolCall(call.name, call.arguments, {",
          },
        ],
        totalMatches: 1,
        truncated: false,
      })
    );
    expect(apiPost).toHaveBeenCalledWith("/api/tool_grep", {
      workspaceDir: "/tmp/project",
      pattern: "executeToolCall",
      path: "src/features/agent",
      glob: undefined,
      outputMode: "content",
      caseInsensitive: undefined,
      contextBefore: undefined,
      contextAfter: undefined,
      context: 1,
      headLimit: undefined,
      offset: undefined,
      multiline: undefined,
      respectGitignore: undefined,
    });
  });
});
