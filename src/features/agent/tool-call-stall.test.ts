import { describe, expect, it } from "vitest";

import {
  ToolCallStallDetector,
  toolCallsSignature,
} from "./tool-call-stall";

describe("toolCallsSignature", () => {
  it("is order-independent for parallel tool calls", () => {
    const first = toolCallsSignature([
      { id: "1", name: "grep", arguments: '{"pattern":"foo"}' },
      { id: "2", name: "read_file", arguments: '{"path":"a.ts"}' },
    ]);
    const second = toolCallsSignature([
      { id: "3", name: "read_file", arguments: '{"path":"a.ts"}' },
      { id: "4", name: "grep", arguments: '{"pattern":"foo"}' },
    ]);

    expect(first).toBe(second);
  });
});

describe("ToolCallStallDetector", () => {
  it("does not flag diverse tool rounds", () => {
    const detector = new ToolCallStallDetector();

    expect(
      detector.record([
        { id: "1", name: "read_file", arguments: '{"path":"a.ts"}' },
      ])
    ).toBe(false);
    expect(
      detector.record([
        { id: "2", name: "read_file", arguments: '{"path":"b.ts"}' },
      ])
    ).toBe(false);
    expect(
      detector.record([{ id: "3", name: "grep", arguments: '{"pattern":"x"}' }])
    ).toBe(false);
  });

  it("flags repeated identical tool batches", () => {
    const detector = new ToolCallStallDetector();
    const toolCalls = [
      { id: "1", name: "read_file", arguments: '{"path":"a.ts"}' },
    ];

    expect(detector.record(toolCalls)).toBe(false);
    expect(detector.record(toolCalls)).toBe(false);
    expect(detector.record(toolCalls)).toBe(true);
  });
});
