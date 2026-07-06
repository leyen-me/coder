import { describe, expect, it } from "vitest";

import { consumeSseLines } from "./browser-runner";

describe("consumeSseLines", () => {
  it("returns trailing data without a newline as rest", () => {
    const { lines, rest } = consumeSseLines(
      'data: {"choices":[{"delta":{"content":"x"}}]}\n: keepalive\n'
    );

    expect(lines).toEqual(['data: {"choices":[{"delta":{"content":"x"}}]}', ": keepalive"]);
    expect(rest).toBe("");
  });

  it("preserves a final line that has no trailing newline", () => {
    const { lines, rest } = consumeSseLines(
      'data: {"choices":[{"delta":{"content":"x"}}]}\ndata: {"choices":[{"finish_reason":"stop"}]}'
    );

    expect(lines).toEqual(['data: {"choices":[{"delta":{"content":"x"}}]}']);
    expect(rest).toBe('data: {"choices":[{"finish_reason":"stop"}]}');
  });
});
