import { describe, expect, it } from "vitest";

import { appendFileMention } from "./composer-insert-store";

describe("appendFileMention", () => {
  it("inserts mention into an empty composer", () => {
    expect(appendFileMention("", "src/App.tsx")).toBe("@src/App.tsx ");
  });

  it("appends mention after existing text", () => {
    expect(appendFileMention("fix bug", "src/App.tsx")).toBe(
      "fix bug @src/App.tsx "
    );
  });

  it("preserves trailing whitespace before appending", () => {
    expect(appendFileMention("fix bug ", "src/App.tsx")).toBe(
      "fix bug @src/App.tsx "
    );
  });

  it("allows repeating the same mention", () => {
    expect(appendFileMention("see @src/App.tsx ", "src/App.tsx")).toBe(
      "see @src/App.tsx @src/App.tsx "
    );
  });

  it("inserts folder paths", () => {
    expect(appendFileMention("", "src/components")).toBe("@src/components ");
  });
});
