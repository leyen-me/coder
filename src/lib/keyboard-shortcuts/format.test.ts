import { describe, expect, it } from "vitest";

import { formatBindingParts } from "./format";

describe("formatBindingParts", () => {
  it("formats mod+shift key parts", () => {
    const originalPlatform = navigator.platform;
    Object.defineProperty(navigator, "platform", {
      value: "MacIntel",
      configurable: true,
    });

    expect(formatBindingParts("mod+shift+k")).toEqual(["⌘", "⇧", "K"]);

    Object.defineProperty(navigator, "platform", {
      value: originalPlatform,
      configurable: true,
    });
  });

  it("formats windows modifier labels", () => {
    const originalPlatform = navigator.platform;
    Object.defineProperty(navigator, "platform", {
      value: "Win32",
      configurable: true,
    });

    expect(formatBindingParts("mod+k")).toEqual(["Ctrl", "K"]);

    Object.defineProperty(navigator, "platform", {
      value: originalPlatform,
      configurable: true,
    });
  });
});
