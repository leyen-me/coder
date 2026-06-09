import { describe, expect, it } from "vitest";

import { formatTerminalTabPath } from "./format-terminal-tab-path";

describe("formatTerminalTabPath", () => {
  it("returns the cwd when no home directory is provided", () => {
    expect(formatTerminalTabPath("C:/Users/alice/projects/coder")).toBe(
      "C:/Users/alice/projects/coder"
    );
  });

  it("shortens the home directory to ~", () => {
    expect(
      formatTerminalTabPath(
        "C:/Users/alice",
        "C:/Users/alice"
      )
    ).toBe("~");
  });

  it("shortens paths under the home directory", () => {
    expect(
      formatTerminalTabPath(
        "C:/Users/alice/projects/coder",
        "C:/Users/alice"
      )
    ).toBe("~/projects/coder");
  });
});
