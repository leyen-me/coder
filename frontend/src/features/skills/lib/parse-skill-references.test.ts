import { describe, expect, it } from "vitest";

import {
  extractSkillSlugsFromText,
  injectReferencedSkillsIntoUserContent,
} from "./parse-skill-references";

describe("parse skill references", () => {
  it("extracts unique skill slugs from slash references", () => {
    expect(
      extractSkillSlugsFromText("please /review this and /debug that and /review again")
    ).toEqual(["review", "debug"]);
  });

  it("injects referenced skills as titled prompt blocks before user content", () => {
    const prompt = injectReferencedSkillsIntoUserContent("fix the bug", [
      { slug: "review", content: "Check correctness first." },
      { slug: "debug", content: "Reproduce before patching." },
    ]);

    expect(prompt).toContain("## Referenced skill: review");
    expect(prompt).toContain("Check correctness first.");
    expect(prompt).toContain("## Referenced skill: debug");
    expect(prompt).toContain("Reproduce before patching.");
    expect(prompt.trim().endsWith("fix the bug")).toBe(true);
  });
});
