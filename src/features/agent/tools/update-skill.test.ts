import { describe, expect, it, beforeEach, vi } from "vitest";

import { UPDATE_SKILL_TOOL_NAME } from "./definitions";
import { updateSkillHandler } from "./update-skill";
import { toolFailure, toolSuccess } from "./result";

vi.mock("@/lib/db/skills", () => ({
  getUserSkillBySlug: vi.fn(),
  updateUserSkill: vi.fn(),
}));

vi.mock("@/features/skills/lib/resolve-skills", () => ({
  assertUserSkillSlugAvailable: vi.fn(),
}));

import { assertUserSkillSlugAvailable } from "@/features/skills/lib/resolve-skills";
import { getUserSkillBySlug, updateUserSkill } from "@/lib/db/skills";

const existingSkill = {
  id: "skill-1",
  slug: "my-skill",
  name: "My Skill",
  description: "Use when reviewing pull requests.",
  content: "# Code review\n\nCheck tests and types.",
  enabled: true,
  createdAt: 1000,
  updatedAt: 1000,
};

describe("updateSkillHandler", () => {
  beforeEach(() => {
    vi.mocked(getUserSkillBySlug).mockResolvedValue(existingSkill);
    vi.mocked(assertUserSkillSlugAvailable).mockImplementation(() => undefined);
    vi.mocked(updateUserSkill).mockResolvedValue({
      ...existingSkill,
      name: "Updated Skill",
      updatedAt: 2000,
    });
  });

  it("requires slug", async () => {
    const result = await updateSkillHandler({}, { workspaceDir: null });
    expect(result).toEqual(
      toolFailure(UPDATE_SKILL_TOOL_NAME, "invalid_arguments", "slug is required")
    );
  });

  it("requires at least one updatable field", async () => {
    const result = await updateSkillHandler(
      { slug: "my-skill" },
      { workspaceDir: null }
    );
    expect(result).toEqual(
      toolFailure(
        UPDATE_SKILL_TOOL_NAME,
        "invalid_arguments",
        "At least one of name, description, or content must be provided to update."
      )
    );
  });

  it("rejects empty name when provided", async () => {
    const result = await updateSkillHandler(
      { slug: "my-skill", name: "  " },
      { workspaceDir: null }
    );
    expect(result).toEqual(
      toolFailure(
        UPDATE_SKILL_TOOL_NAME,
        "invalid_arguments",
        "name must be a non-empty string if provided"
      )
    );
  });

  it("rejects unknown slug", async () => {
    vi.mocked(getUserSkillBySlug).mockResolvedValue(null);

    const result = await updateSkillHandler(
      { slug: "does-not-exist", name: "New Name" },
      { workspaceDir: null }
    );
    expect(result).toEqual(
      toolFailure(
        UPDATE_SKILL_TOOL_NAME,
        "not_found",
        'No user skill found with slug "does-not-exist". Use create_skill to create a new skill.'
      )
    );
  });

  it("rejects system skill slug conflicts", async () => {
    vi.mocked(assertUserSkillSlugAvailable).mockImplementation(() => {
      throw new Error("Slug conflicts with a system skill");
    });

    const result = await updateSkillHandler(
      { slug: "my-skill", name: "New Name" },
      { workspaceDir: null }
    );
    expect(result).toEqual(
      toolFailure(UPDATE_SKILL_TOOL_NAME, "slug_conflict", "Slug conflicts with a system skill")
    );
  });

  it("updates name only", async () => {
    vi.mocked(updateUserSkill).mockResolvedValue({
      ...existingSkill,
      name: "Updated Skill",
      updatedAt: 2000,
    });

    const result = await updateSkillHandler(
      { slug: "my-skill", name: "Updated Skill" },
      { workspaceDir: null }
    );
    expect(updateUserSkill).toHaveBeenCalledWith("skill-1", { name: "Updated Skill" });
    expect(result).toEqual(
      toolSuccess(UPDATE_SKILL_TOOL_NAME, {
        id: "skill-1",
        slug: "my-skill",
        name: "Updated Skill",
        description: "Use when reviewing pull requests.",
        enabled: true,
      })
    );
  });

  it("updates all fields", async () => {
    const updated = {
      ...existingSkill,
      name: "New Name",
      description: "New description",
      content: "# New content",
      updatedAt: 2000,
    };
    vi.mocked(updateUserSkill).mockResolvedValue(updated);

    const result = await updateSkillHandler(
      {
        slug: "my-skill",
        name: "New Name",
        description: "New description",
        content: "# New content",
      },
      { workspaceDir: null }
    );
    expect(updateUserSkill).toHaveBeenCalledWith("skill-1", {
      name: "New Name",
      description: "New description",
      content: "# New content",
    });
    expect(result).toEqual(
      toolSuccess(UPDATE_SKILL_TOOL_NAME, {
        id: "skill-1",
        slug: "my-skill",
        name: "New Name",
        description: "New description",
        enabled: true,
      })
    );
  });

  it("maps duplicate slug errors", async () => {
    vi.mocked(updateUserSkill).mockRejectedValue(new Error("Skill slug already exists"));

    const result = await updateSkillHandler(
      { slug: "my-skill", name: "New Name" },
      { workspaceDir: null }
    );
    expect(result).toEqual(
      toolFailure(UPDATE_SKILL_TOOL_NAME, "slug_exists", "Skill slug already exists")
    );
  });

  it("handles skill removed before update completes", async () => {
    vi.mocked(updateUserSkill).mockResolvedValue(null);

    const result = await updateSkillHandler(
      { slug: "my-skill", name: "New Name" },
      { workspaceDir: null }
    );
    expect(result).toEqual(
      toolFailure(
        UPDATE_SKILL_TOOL_NAME,
        "not_found",
        'Skill "my-skill" was removed before the update could complete.'
      )
    );
  });
});
