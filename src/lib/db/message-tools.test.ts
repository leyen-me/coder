import { describe, expect, it } from "vitest";

import { mergeToolInvocations } from "./message-tools";
import type { MessageToolInvocation } from "./types";

function invocation(
  overrides: Partial<MessageToolInvocation> & Pick<MessageToolInvocation, "id" | "name">
): MessageToolInvocation {
  return {
    input: {},
    state: "input-available",
    ...overrides,
  };
}

describe("mergeToolInvocations", () => {
  it("keeps completed tool state when a stale flush arrives later", () => {
    const existing = [
      invocation({
        id: "call_1",
        name: "read_file",
        state: "output-available",
        output: { ok: true },
      }),
    ];
    const incoming = [
      invocation({
        id: "call_1",
        name: "read_file",
        state: "input-available",
      }),
    ];

    expect(mergeToolInvocations(existing, incoming)).toEqual(existing);
  });

  it("accepts newly completed tools from incoming updates", () => {
    const existing = [
      invocation({
        id: "call_1",
        name: "read_file",
      }),
    ];
    const incoming = [
      invocation({
        id: "call_1",
        name: "read_file",
        state: "output-available",
        output: { ok: true },
      }),
    ];

    expect(mergeToolInvocations(existing, incoming)).toEqual(incoming);
  });

  it("preserves invocation order and appends new ids", () => {
    const existing = [
      invocation({ id: "call_1", name: "read_file", state: "output-available" }),
    ];
    const incoming = [
      invocation({ id: "call_2", name: "list_dir", state: "input-available" }),
    ];

    expect(mergeToolInvocations(existing, incoming).map((item) => item.id)).toEqual([
      "call_1",
      "call_2",
    ]);
  });
});
