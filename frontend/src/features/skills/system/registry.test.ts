import { describe, expect, it } from "vitest";

import {
  getAllSystemModuleSlugs,
  getSystemModuleById,
  getSystemModuleBySlug,
  SYSTEM_MODULES,
} from "./registry";

describe("system module registry", () => {
  it("exports the known system modules catalog", () => {
    expect(SYSTEM_MODULES.length).toBeGreaterThan(5);
    expect(SYSTEM_MODULES[0]?.slug).toBe("agent-operating-principles");
    expect(SYSTEM_MODULES.some((module) => module.slug === "tool-usage")).toBe(true);
  });

  it("resolves modules by slug and id", () => {
    const bySlug = getSystemModuleBySlug("tool-usage");
    expect(bySlug?.name).toBe("Tool Usage");

    const byId = getSystemModuleById("verification");
    expect(byId?.slug).toBe("verification");
  });

  it("returns a unique slug set", () => {
    const slugs = getAllSystemModuleSlugs();
    expect(slugs.has("communication")).toBe(true);
    expect(slugs.size).toBe(SYSTEM_MODULES.length);
  });
});
