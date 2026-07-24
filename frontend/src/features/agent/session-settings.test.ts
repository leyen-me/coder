import { beforeEach, describe, expect, it } from "vitest";

import {
  DEFAULT_AGENT_SESSION_THRESHOLD,
  MAX_AGENT_SESSION_THRESHOLD,
  MIN_AGENT_SESSION_THRESHOLD,
  normalizeSessionThreshold,
  readAgentSessionThreshold,
  writeAgentSessionThreshold,
} from "./session-settings";
import { resetKVStore } from "@/lib/storage";

describe("session-settings", () => {
  beforeEach(() => {
    resetKVStore();
  });

  it("defaults to 80 percent", () => {
    expect(DEFAULT_AGENT_SESSION_THRESHOLD).toBe(0.8);
  });

  it("clamps configured thresholds into the supported range", () => {
    expect(normalizeSessionThreshold(0.2)).toBe(
      MIN_AGENT_SESSION_THRESHOLD
    );
    expect(normalizeSessionThreshold(0.99)).toBe(
      MAX_AGENT_SESSION_THRESHOLD
    );
    expect(normalizeSessionThreshold(0.83)).toBe(0.83);
  });

  it("persists and restores the threshold", () => {
    writeAgentSessionThreshold(0.84);
    expect(readAgentSessionThreshold()).toBe(0.84);
  });
});
