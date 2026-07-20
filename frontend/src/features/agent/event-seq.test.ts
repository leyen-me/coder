import { describe, expect, it } from "vitest";

import {
  clearAgentEventSeq,
  seedAgentEventSeq,
  shouldApplyAgentEventSeq,
} from "./event-seq";

describe("shouldApplyAgentEventSeq", () => {
  it("applies the first seq and rejects duplicates", () => {
    const last = new Map<string, number>();
    expect(shouldApplyAgentEventSeq(last, "t1", 1)).toBe(true);
    expect(shouldApplyAgentEventSeq(last, "t1", 1)).toBe(false);
    expect(shouldApplyAgentEventSeq(last, "t1", 2)).toBe(true);
    expect(last.get("t1")).toBe(2);
  });

  it("rejects replayed older seq after seed", () => {
    const last = new Map<string, number>();
    seedAgentEventSeq(last, "t1", 40);
    expect(shouldApplyAgentEventSeq(last, "t1", 40)).toBe(false);
    expect(shouldApplyAgentEventSeq(last, "t1", 41)).toBe(true);
  });

  it("allows events without seq", () => {
    const last = new Map<string, number>();
    expect(shouldApplyAgentEventSeq(last, "t1", undefined)).toBe(true);
    expect(shouldApplyAgentEventSeq(last, "t1", "1")).toBe(true);
  });

  it("clear removes the cursor", () => {
    const last = new Map<string, number>();
    seedAgentEventSeq(last, "t1", 9);
    clearAgentEventSeq(last, "t1");
    expect(shouldApplyAgentEventSeq(last, "t1", 9)).toBe(true);
  });
});
