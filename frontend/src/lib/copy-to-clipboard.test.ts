import { afterEach, describe, expect, it, vi } from "vitest";

import { copyTextToClipboard } from "./copy-to-clipboard";

function stubDocument(execCommand: ReturnType<typeof vi.fn>) {
  const textarea = {
    value: "",
    style: {} as CSSStyleDeclaration,
    focus: vi.fn(),
    select: vi.fn(),
    setSelectionRange: vi.fn(),
    setAttribute: vi.fn(),
  };

  vi.stubGlobal("document", {
    createElement: vi.fn(() => textarea),
    execCommand,
    body: {
      appendChild: vi.fn(),
      removeChild: vi.fn(),
    },
  });
}

describe("copyTextToClipboard", () => {
  afterEach(() => {
    vi.unstubAllGlobals();
    vi.restoreAllMocks();
  });

  it("uses navigator.clipboard.writeText when available", async () => {
    const writeText = vi.fn().mockResolvedValue(undefined);
    vi.stubGlobal("navigator", { clipboard: { writeText } });

    await copyTextToClipboard("hello");

    expect(writeText).toHaveBeenCalledWith("hello");
  });

  it("falls back when navigator.clipboard.writeText rejects", async () => {
    const writeText = vi.fn().mockRejectedValue(new Error("Denied"));
    const execCommand = vi.fn().mockReturnValue(true);
    vi.stubGlobal("navigator", { clipboard: { writeText } });
    stubDocument(execCommand);

    await copyTextToClipboard("fallback text");

    expect(writeText).toHaveBeenCalledWith("fallback text");
    expect(execCommand).toHaveBeenCalledWith("copy");
  });

  it("falls back when navigator.clipboard is missing", async () => {
    vi.stubGlobal("navigator", {});
    const execCommand = vi.fn().mockReturnValue(true);
    stubDocument(execCommand);

    await copyTextToClipboard("legacy copy");

    expect(execCommand).toHaveBeenCalledWith("copy");
  });

  it("throws when all copy strategies fail", async () => {
    vi.stubGlobal("navigator", {});
    stubDocument(vi.fn().mockReturnValue(false));

    await expect(copyTextToClipboard("nope")).rejects.toThrow(
      "Clipboard not available"
    );
  });
});
