import { describe, expect, it } from "vitest";

import { toApiToolCall } from "@/features/agent/tools/api-tool-call";

describe("toApiToolCall", () => {
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
