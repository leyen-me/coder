import { describe, expect, it } from "vitest";

import { toApiToolCall } from "@/features/agent/tools/api-tool-call";

describe("toApiToolCall", () => {
  it("sanitizes malformed tool arguments before sending to the API", () => {
    expect(
      toApiToolCall({
        id: "call_2",
        name: "write_file",
        arguments: "{\"create_parent_dirs\": false",
      })
    ).toEqual({
      id: "call_2",
      type: "function",
      function: {
        name: "write_file",
        arguments: "{\"raw\":\"{\\\"create_parent_dirs\\\": false\"}",
      },
    });
  });

  it("maps internal tool calls to OpenAI-compatible shape", () => {
    expect(
      toApiToolCall({
        id: "call_1",
        name: "list_dir",
        arguments: "{\"path\":\".\"}",
      })
    ).toEqual({
      id: "call_1",
      type: "function",
      function: {
        name: "list_dir",
        arguments: "{\"path\":\".\"}",
      },
    });
  });
});
