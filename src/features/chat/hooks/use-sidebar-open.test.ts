import { describe, expect, it } from "vitest";

import { toggleSidebarOpen } from "./use-sidebar-open";

describe("toggleSidebarOpen", () => {
  it("returns false when the sidebar is open", () => {
    expect(toggleSidebarOpen(true)).toBe(false);
  });

  it("returns true when the sidebar is closed", () => {
    expect(toggleSidebarOpen(false)).toBe(true);
  });
});
