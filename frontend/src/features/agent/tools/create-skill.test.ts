import { describe, expect, it, vi } from "vitest";

import { CREATE_SKILL_TOOL_NAME } from "./definitions";
import { createSkillHandler } from "./create-skill";
import { toolFailure, toolSuccess } from "./result";

vi.mock("@/lib/db/skills", () => ({
  createUserSkill: vi.fn(),
  isValidSkillSlug: vi.fn(
    (slug: string) => /^[a-z0-9]+(?:-[a-z0-9]+)*$/.test(slug)
  ),
}));

vi.mock("@/features/skills/lib/resolve-skills", () => ({
  assertUserSkillSlugAvailable: vi.fn(),
}));

import { assertUserSkillSlugAvailable } from "@/features/skills/lib/resolve-skills";
import { createUserSkill } from "@/lib/db/skills";

const validArgs = {
  slug: "my-skill",
  name: "My Skill",
  description: "Use when reviewing pull requests.",
  content: "# Code review\n\nCheck tests and types.",
};

describe("createSkillHandler", () => {
  it("requires all fields", async () => {
    const result = await createSkillHandler({ slug: "my-skill" }, { workspaceDir: null });
    expect(result).toEqual(
      toolFailure(CREATE_SKILL_TOOL_NAME, "invalid_arguments", "name is required")
    );
  });

  it("rejects invalid slug format", async () => {
    const result = await createSkillHandler(
      { ...validArgs, slug: "My_Skill" },
      { workspaceDir: null }
    );
    expect(result).toEqual(
      toolFailure(
        CREATE_SKILL_TOOL_NAME,
        "invalid_slug",
        "Slug must use lowercase letters, numbers, and hyphens (e.g. my-skill)."
      )
    );
  });

  it("rejects system skill slug conflicts", async () => {
    vi.mocked(assertUserSkillSlugAvailable).mockImplementation(() => {
      throw new Error("Slug conflicts with a system skill");
    });

    const result = await createSkillHandler(validArgs, { workspaceDir: null });
    expect(result).toEqual(
      toolFailure(
        CREATE_SKILL_TOOL_NAME,
        "slug_conflict",
        "Slug conflicts with a system skill"
      )
    );
  });

  it("creates a disabled user skill", async () => {
    vi.mocked(assertUserSkillSlugAvailable).mockImplementation(() => undefined);
    vi.mocked(createUserSkill).mockResolvedValue({
      id: "skill-1",
      slug: "my-skill",
      name: "My Skill",
      description: "Use when reviewing pull requests.",
      content: validArgs.content,
      enabled: false,
      createdAt: 1,
      updatedAt: 1,
    });

    const result = await createSkillHandler(validArgs, { workspaceDir: null });
    expect(createUserSkill).toHaveBeenCalledWith(validArgs);
    expect(result).toEqual(
      toolSuccess(CREATE_SKILL_TOOL_NAME, {
        id: "skill-1",
        slug: "my-skill",
        name: "My Skill",
        description: "Use when reviewing pull requests.",
        enabled: false,
        hint: "Skill was created disabled. Ask the user to enable it on the Skills page before using /slug or read_skill.",
      })
    );
  });

  it("maps duplicate slug errors", async () => {
    vi.mocked(assertUserSkillSlugAvailable).mockImplementation(() => undefined);
    vi.mocked(createUserSkill).mockRejectedValue(new Error("Skill slug already exists"));

    const result = await createSkillHandler(validArgs, { workspaceDir: null });
    expect(result).toEqual(
      toolFailure(CREATE_SKILL_TOOL_NAME, "slug_exists", "Skill slug already exists")
    );
  });
});
