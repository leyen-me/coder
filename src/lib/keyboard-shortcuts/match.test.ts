import { describe, expect, it } from "vitest";

import {
  bindingsConflict,
  matchKeyboardEvent,
  normalizeBinding,
} from "./match";

function createKeyboardEvent(
  init: Partial<KeyboardEvent> & { key: string }
): KeyboardEvent {
  return {
    key: init.key,
    metaKey: init.metaKey ?? false,
    ctrlKey: init.ctrlKey ?? false,
    shiftKey: init.shiftKey ?? false,
    altKey: init.altKey ?? false,
    repeat: init.repeat ?? false,
  } as KeyboardEvent;
}

describe("matchKeyboardEvent", () => {
  it("matches mod+k on macOS", () => {
    const originalPlatform = navigator.platform;
    Object.defineProperty(navigator, "platform", {
      value: "MacIntel",
      configurable: true,
    });

    expect(
      matchKeyboardEvent(
        createKeyboardEvent({ key: "k", metaKey: true }),
        "mod+k"
      )
    ).toBe(true);

    Object.defineProperty(navigator, "platform", {
      value: originalPlatform,
      configurable: true,
    });
  });

  it("matches mod+k on windows", () => {
    const originalPlatform = navigator.platform;
    Object.defineProperty(navigator, "platform", {
      value: "Win32",
      configurable: true,
    });

    expect(
      matchKeyboardEvent(
        createKeyboardEvent({ key: "k", ctrlKey: true }),
        "mod+k"
      )
    ).toBe(true);

    Object.defineProperty(navigator, "platform", {
      value: originalPlatform,
      configurable: true,
    });
  });

  it("matches ctrl+backquote", () => {
    expect(
      matchKeyboardEvent(
        createKeyboardEvent({ key: "`", ctrlKey: true }),
        "ctrl+backquote"
      )
    ).toBe(true);
  });

  it("matches escape without modifiers", () => {
    expect(
      matchKeyboardEvent(createKeyboardEvent({ key: "Escape" }), "escape")
    ).toBe(true);
  });
});

describe("normalizeBinding", () => {
  it("normalizes comma binding", () => {
    expect(normalizeBinding("Mod+Comma")).toBe("mod+comma");
  });
});

describe("bindingsConflict", () => {
  it("detects equivalent bindings", () => {
    expect(bindingsConflict("mod+shift+c", "Mod+Shift+C")).toBe(true);
    expect(bindingsConflict("mod+k", "mod+n")).toBe(false);
  });
});
