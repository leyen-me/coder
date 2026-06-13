import { describe, expect, it } from "vitest";

import {
  AGENT_HANDOFF_THRESHOLD_STORAGE_KEY,
  DEFAULT_AGENT_HANDOFF_THRESHOLD,
  MAX_AGENT_HANDOFF_THRESHOLD,
  MIN_AGENT_HANDOFF_THRESHOLD,
  normalizeAgentHandoffThreshold,
  readAgentHandoffThreshold,
  writeAgentHandoffThreshold,
} from "./handoff-settings";

describe("handoff-settings", () => {
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

  it("persists and restores the threshold from local storage", () => {
    if (typeof localStorage === "undefined") {
      return;
    }

    localStorage.removeItem(AGENT_HANDOFF_THRESHOLD_STORAGE_KEY);
    writeAgentHandoffThreshold(0.84);
    expect(readAgentHandoffThreshold()).toBe(0.84);
  });
});
