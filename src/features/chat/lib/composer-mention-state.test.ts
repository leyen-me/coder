import { describe, expect, it } from "vitest";

import {
  parentPathForMatch,
  parseActiveComposerMention,
} from "./composer-mention-state";

describe("parseActiveComposerMention", () => {
  it("detects an active mention at the end of the paragraph", () => {
    const textBefore = "fix @src/ap";
    const mention = parseActiveComposerMention(textBefore, textBefore.length, 1);

    expect(mention).toEqual({
      query: "src/ap",
      range: {
        from: 5,
        to: 12,
      },
    });
  });

  it("detects mention after whitespace", () => {
    const textBefore = "hello @x";
    const mention = parseActiveComposerMention(textBefore, textBefore.length, 1);

    expect(mention?.query).toBe("x");
  });

  it("returns null when mention is not at the cursor", () => {
    const textBefore = "@src/App.tsx fix";
    expect(
      parseActiveComposerMention(textBefore, textBefore.length, 1)
    ).toBeNull();
  });

  it("returns null when there is no mention", () => {
    const textBefore = "plain text";
    expect(
      parseActiveComposerMention(textBefore, textBefore.length, 1)
    ).toBeNull();
  });
});

describe("parentPathForMatch", () => {
  it("returns the parent directory for nested paths", () => {
    expect(parentPathForMatch("src/components/App.tsx")).toBe("src/components");
  });

  it("returns empty string for top-level paths", () => {
    expect(parentPathForMatch("README.md")).toBe("");
  });
});
