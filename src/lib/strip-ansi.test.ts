import { describe, expect, it } from "vitest";

import { stripAnsi } from "./strip-ansi";

describe("stripAnsi", () => {
  it("removes SGR color codes from vite-style output", () => {
    const raw =
      "\u001B[32m\u001B[1mVITE\u001B[22m v8.0.16\u001B[39m  \u001B[2mready in \u001B[0m\u001B[1m341\u001B[22m\u001B[2m\u001B[0m ms\u001B[22m";

    expect(stripAnsi(raw)).toBe("VITE v8.0.16  ready in 341 ms");
  });

  it("preserves plain text without escape sequences", () => {
    expect(stripAnsi("npm warn Unknown env config")).toBe(
      "npm warn Unknown env config"
    );
  });

  it("returns empty strings unchanged", () => {
    expect(stripAnsi("")).toBe("");
  });
});
