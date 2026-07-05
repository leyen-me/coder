import { afterEach, describe, expect, it, vi } from "vitest";

import { copyTextToClipboard } from "./copy-to-clipboard";

describe("copyTextToClipboard", () => {
  afterEach(() => {
    vi.unstubAllGlobals();
  });

  it("uses navigator.clipboard when available", async () => {
    const writeText = vi.fn(async () => undefined);
    vi.stubGlobal("navigator", { clipboard: { writeText } });

    await copyTextToClipboard("hello");

    expect(writeText).toHaveBeenCalledWith("hello");
  });

  it("falls back to execCommand when clipboard API is unavailable", async () => {
    const execCommand = vi.fn(() => true);
    const textarea = {
      value: "",
      style: {} as CSSStyleDeclaration,
      setAttribute: vi.fn(),
      select: vi.fn(),
    };
    const body = {
      appendChild: vi.fn(),
      removeChild: vi.fn(),
    };

    vi.stubGlobal("navigator", {});
    vi.stubGlobal("document", {
      createElement: vi.fn(() => textarea),
      body,
      execCommand,
    });

    await copyTextToClipboard("fallback");

    expect(body.appendChild).toHaveBeenCalledWith(textarea);
    expect(execCommand).toHaveBeenCalledWith("copy");
    expect(body.removeChild).toHaveBeenCalledWith(textarea);
  });
});
