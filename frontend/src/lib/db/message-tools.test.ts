import { describe, expect, it } from "vitest";

import { mergeToolInvocations, normalizeToolInvocations } from "./message-tools";
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

describe("normalizeToolInvocations", () => {
  it("wraps backend raw successful outputs in a tool result envelope", () => {
    const invocations: MessageToolInvocation[] = [
      invocation({
        id: "tool-1",
        name: "glob",
        state: "output-available",
        output: {
          matches: ["src/index.ts"],
          pattern: "**/*.ts",
          targetDirectory: "/workspace",
          totalMatches: 1,
          truncated: false,
        },
      }),
    ];

    expect(normalizeToolInvocations(invocations)).toEqual([
      {
        ...invocations[0],
        output: {
          ok: true,
          tool: "glob",
          data: invocations[0].output,
        },
      },
    ]);
  });

  it("preserves existing enveloped outputs", () => {
    const invocations: MessageToolInvocation[] = [
      invocation({
        id: "tool-1",
        name: "read_file",
        state: "output-available",
        output: {
          ok: true,
          tool: "read_file",
          data: {
            path: "README.md",
            content: "# Hello",
          },
        },
      }),
    ];

    expect(normalizeToolInvocations(invocations)).toEqual(invocations);
  });

  it("preserves legacy ok-only outputs without re-wrapping them", () => {
    const invocations: MessageToolInvocation[] = [
      invocation({
        id: "tool-1",
        name: "read_file",
        state: "output-available",
        output: { ok: true },
      }),
    ];

    expect(normalizeToolInvocations(invocations)).toEqual(invocations);
  });
});

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
