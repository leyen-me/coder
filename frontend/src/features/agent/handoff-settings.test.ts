import { beforeEach, describe, expect, it } from "vitest";

import {
  DEFAULT_AGENT_HANDOFF_THRESHOLD,
  MAX_AGENT_HANDOFF_THRESHOLD,
  MIN_AGENT_HANDOFF_THRESHOLD,
  normalizeAgentHandoffThreshold,
  readAgentHandoffThreshold,
  writeAgentHandoffThreshold,
} from "./handoff-settings";
import { resetKVStore } from "@/lib/storage";

describe("handoff-settings", () => {
  beforeEach(() => {
    resetKVStore();
  });

  it("defaults to 80 percent", () => {
    expect(DEFAULT_AGENT_HANDOFF_THRESHOLD).toBe(0.8);
  });

  it("clamps configured thresholds into the supported range", () => {
    expect(normalizeAgentHandoffThreshold(0.2)).toBe(
      MIN_AGENT_HANDOFF_THRESHOLD
    );
    expect(normalizeAgentHandoffThreshold(0.99)).toBe(
      MAX_AGENT_HANDOFF_THRESHOLD
    );
    expect(normalizeAgentHandoffThreshold(0.83)).toBe(0.83);
  });

  it("persists and restores the threshold", () => {
    writeAgentHandoffThreshold(0.84);
    expect(readAgentHandoffThreshold()).toBe(0.84);
  });
});
