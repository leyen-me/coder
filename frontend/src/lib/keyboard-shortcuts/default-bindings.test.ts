import { describe, expect, it } from "vitest";

import {
  getDefaultBinding,
  getDefaultKeyboardShortcuts,
  migrateBrowserConflictBindings,
} from "./default-bindings";

function withPlatform(platform: string, run: () => void): void {
  const originalPlatform = navigator.platform;
  Object.defineProperty(navigator, "platform", {
    value: platform,
    configurable: true,
  });

  try {
    run();
  } finally {
    Object.defineProperty(navigator, "platform", {
      value: originalPlatform,
      configurable: true,
    });
  }
}

describe("getDefaultBinding", () => {
  it("keeps mac defaults on macOS", () => {
    withPlatform("MacIntel", () => {
      expect(getDefaultBinding("global.newChat")).toBe("mod+n");
      expect(getDefaultBinding("chat.regenerate")).toBe("mod+shift+r");
    });
  });

  it("uses browser-safe defaults on Windows", () => {
    withPlatform("Win32", () => {
      expect(getDefaultBinding("global.newChat")).toBe("mod+alt+n");
      expect(getDefaultBinding("chat.regenerate")).toBe("mod+alt+r");
      expect(getDefaultBinding("global.search")).toBe("mod+k");
    });
  });
});

describe("migrateBrowserConflictBindings", () => {
  it("migrates legacy conflict bindings on Windows", () => {
    withPlatform("Win32", () => {
      const migrated = migrateBrowserConflictBindings({
        ...getDefaultKeyboardShortcuts(),
        "global.newChat": "mod+n",
        "chat.regenerate": "mod+shift+r",
      });

      expect(migrated["global.newChat"]).toBe("mod+alt+n");
      expect(migrated["chat.regenerate"]).toBe("mod+alt+r");
    });
  });

  it("leaves customized bindings untouched", () => {
    withPlatform("Win32", () => {
      const migrated = migrateBrowserConflictBindings({
        ...getDefaultKeyboardShortcuts(),
        "global.newChat": "mod+shift+n",
        "chat.regenerate": "mod+r",
      });

      expect(migrated["global.newChat"]).toBe("mod+shift+n");
      expect(migrated["chat.regenerate"]).toBe("mod+r");
    });
  });

  it("does not migrate on macOS", () => {
    withPlatform("MacIntel", () => {
      const migrated = migrateBrowserConflictBindings({
        ...getDefaultKeyboardShortcuts(),
        "global.newChat": "mod+n",
        "chat.regenerate": "mod+shift+r",
      });

      expect(migrated["global.newChat"]).toBe("mod+n");
      expect(migrated["chat.regenerate"]).toBe("mod+shift+r");
    });
  });
});
