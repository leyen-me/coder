import { describe, expect, it } from "vitest";

import {
  POLL_TOOL_NAMES,
  ToolCallStallDetector,
  toolCallsSignature,
} from "./tool-call-stall";

describe("POLL_TOOL_NAMES", () => {
  it("includes await and read_shell_logs", () => {
    expect(POLL_TOOL_NAMES.has("await")).toBe(true);
    expect(POLL_TOOL_NAMES.has("read_shell_logs")).toBe(true);
  });
});

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
  const NO_POLL = new Set<string>();

  it("does not flag diverse tool rounds", () => {
    const detector = new ToolCallStallDetector(3, NO_POLL);

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
    const detector = new ToolCallStallDetector(3, NO_POLL);
    const toolCalls = [
      { id: "1", name: "read_file", arguments: '{"path":"a.ts"}' },
    ];

    expect(detector.record(toolCalls)).toBe(false);
    expect(detector.record(toolCalls)).toBe(false);
    expect(detector.record(toolCalls)).toBe(true);
  });

  it("does not flag repeated poll-only tool calls", () => {
    const detector = new ToolCallStallDetector(3, new Set(["await"]));
    const toolCalls = [
      { id: "1", name: "await", arguments: '{"shell_id":"s1"}' },
    ];

    // Even after many identical calls, poll tools should never trigger stall
    expect(detector.record(toolCalls)).toBe(false);
    expect(detector.record(toolCalls)).toBe(false);
    expect(detector.record(toolCalls)).toBe(false);
    expect(detector.record(toolCalls)).toBe(false);
  });

  it("still detects stall on non-poll tools mixed with poll tools", () => {
    const detector = new ToolCallStallDetector(3, new Set(["await"]));

    // Same non-poll call repeated with different poll calls
    const nonPollCall = [
      { id: "1", name: "read_file", arguments: '{"path":"a.ts"}' },
      { id: "2", name: "await", arguments: '{"shell_id":"s1"}' },
    ];

    // Round 1
    expect(detector.record(nonPollCall)).toBe(false);
    // Round 2
    expect(detector.record(nonPollCall)).toBe(false);
    // Round 3 — still stuck on read_file
    expect(detector.record(nonPollCall)).toBe(true);
  });
});
