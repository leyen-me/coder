import { describe, expect, it } from "vitest";

import {
  createModelDefinition,
  formatContextWindow,
  normalizeModelDefinition,
  parseModelDefinitions,
} from "./model-definition";

describe("normalizeModelDefinition", () => {
  it("creates defaults from a model id string", () => {
    expect(normalizeModelDefinition("gpt-4o")).toEqual(
      createModelDefinition("gpt-4o")
    );
  });

  it("parses a full model object", () => {
    expect(
      normalizeModelDefinition({
        id: "glm-5",
        label: "GLM-5",
        contextWindow: 200_000,
        supportsThinking: true,
        supportsMultimodal: true,
      })
    ).toEqual({
      id: "glm-5",
      label: "GLM-5",
      contextWindow: 200_000,
      supportsThinking: true,
      supportsMultimodal: true,
    });
  });

  it("rejects invalid entries", () => {
    expect(normalizeModelDefinition("")).toBeNull();
    expect(normalizeModelDefinition({ id: "" })).toBeNull();
    expect(normalizeModelDefinition(null)).toBeNull();
  });
});

describe("parseModelDefinitions", () => {
  it("deduplicates models by id", () => {
    expect(
      parseModelDefinitions(["gpt-4o", { id: "gpt-4o", supportsThinking: true }])
    ).toEqual([createModelDefinition("gpt-4o")]);
  });

  it("filters invalid entries", () => {
    expect(
      parseModelDefinitions(["valid", "", 42, { id: "  trimmed  " }])
    ).toEqual([createModelDefinition("valid"), createModelDefinition("trimmed")]);
  });
});

describe("formatContextWindow", () => {
  it("formats common token sizes", () => {
    expect(formatContextWindow(8_000)).toBe("8K");
    expect(formatContextWindow(200_000)).toBe("200K");
    expect(formatContextWindow(1_000_000)).toBe("1M");
  });
});

describe("createModelDefinition", () => {
  it("defaults context window to 200K", () => {
    expect(createModelDefinition("custom-model").contextWindow).toBe(200_000);
  });
});
