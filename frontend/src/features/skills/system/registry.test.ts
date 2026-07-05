import { describe, expect, it } from "vitest";

import {
  getAllSystemSkillSlugs,
  getSystemSkillById,
  getSystemSkillBySlug,
  SYSTEM_SKILLS,
} from "./registry";

describe("system skill registry", () => {
  it("exports the known system skills catalog", () => {
    expect(SYSTEM_SKILLS.length).toBeGreaterThan(5);
    expect(SYSTEM_SKILLS[0]?.slug).toBe("agent-operating-principles");
    expect(SYSTEM_SKILLS.some((skill) => skill.slug === "tool-usage")).toBe(true);
  });

  it("resolves skills by slug and id", () => {
    const bySlug = getSystemSkillBySlug("tool-usage");
    expect(bySlug?.name).toBe("Tool Usage");

    const byId = getSystemSkillById("verification");
    expect(byId?.slug).toBe("verification");
  });

  it("returns a unique slug set", () => {
    const slugs = getAllSystemSkillSlugs();
    expect(slugs.has("communication")).toBe(true);
    expect(slugs.size).toBe(SYSTEM_SKILLS.length);
  });
});
