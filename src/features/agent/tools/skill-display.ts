import {
  CREATE_SKILL_TOOL_NAME,
  LIST_SKILLS_TOOL_NAME,
  READ_SKILL_TOOL_NAME,
  UPDATE_SKILL_TOOL_NAME,
} from "./definitions";

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

export type SkillListItem = {
  slug: string;
  name: string;
  description: string;
  source: "system" | "user";
};

export type SkillReadResult = {
  slug: string;
  name: string;
  description: string;
  content: string;
  source: "system" | "user";
};

export type SkillCreateResult = {
  id: string;
  slug: string;
  name: string;
  description: string;
  enabled: boolean;
  hint?: string;
};

export type SkillUpdateResult = {
  id: string;
  slug: string;
  name: string;
  description: string;
  enabled: boolean;
};

// ---------------------------------------------------------------------------
// ListSkills
// ---------------------------------------------------------------------------

const SKILL_TOOLS = new Set([
  LIST_SKILLS_TOOL_NAME,
  READ_SKILL_TOOL_NAME,
  CREATE_SKILL_TOOL_NAME,
  UPDATE_SKILL_TOOL_NAME,
]);

export function getSkillChipLabel(
  toolName: string,
  input: unknown,
  output: unknown,
): string | null {
  if (!SKILL_TOOLS.has(toolName)) {
    return null;
  }

  const inputRecord = asRecord(input);
  const slug =
    typeof inputRecord?.slug === "string" ? inputRecord.slug.trim() : "";

  switch (toolName) {
    case LIST_SKILLS_TOOL_NAME: {
      const data = extractListSkillsData(output);
      if (data) {
        const count = data.skills.length;
        return `list_skills: ${count} skill${count !== 1 ? "s" : ""}`;
      }
      return LIST_SKILLS_TOOL_NAME;
    }

    case READ_SKILL_TOOL_NAME: {
      const data = extractSkillReadData(output);
      if (data) {
        return `read_skill: ${data.slug} (${data.content.length} chars)`;
      }
      return slug ? `read_skill: ${slug}` : READ_SKILL_TOOL_NAME;
    }

    case CREATE_SKILL_TOOL_NAME: {
      const data = extractSkillCreateData(output);
      if (data) {
        return `create_skill: ${data.slug}`;
      }
      return slug ? `create_skill: ${slug}` : CREATE_SKILL_TOOL_NAME;
    }

    case UPDATE_SKILL_TOOL_NAME: {
      const data = extractSkillUpdateData(output);
      if (data) {
        return `update_skill: ${data.slug}`;
      }
      return slug ? `update_skill: ${slug}` : UPDATE_SKILL_TOOL_NAME;
    }

    default:
      return toolName;
  }
}

// ---------------------------------------------------------------------------
// Extractors
// ---------------------------------------------------------------------------

export function extractListSkillsData(
  output: unknown,
): { skills: SkillListItem[] } | null {
  const data = unwrapData(output);
  if (!data || !Array.isArray(data.skills)) {
    return null;
  }

  return {
    skills: data.skills as SkillListItem[],
  };
}

export function extractSkillReadData(
  output: unknown,
): SkillReadResult | null {
  const data = unwrapData(output);
  if (!data || typeof data.slug !== "string" || typeof data.content !== "string") {
    return null;
  }

  return {
    slug: data.slug,
    name: typeof data.name === "string" ? data.name : data.slug,
    description: typeof data.description === "string" ? data.description : "",
    content: data.content,
    source: data.source === "system" ? "system" : "user",
  };
}

export function extractSkillCreateData(
  output: unknown,
): SkillCreateResult | null {
  const data = unwrapData(output);
  if (!data || typeof data.slug !== "string") {
    return null;
  }

  return {
    id: typeof data.id === "string" ? data.id : "",
    slug: data.slug,
    name: typeof data.name === "string" ? data.name : data.slug,
    description: typeof data.description === "string" ? data.description : "",
    enabled: data.enabled === true,
    hint: typeof data.hint === "string" ? data.hint : undefined,
  };
}

export function extractSkillUpdateData(
  output: unknown,
): SkillUpdateResult | null {
  const data = unwrapData(output);
  if (!data || typeof data.slug !== "string") {
    return null;
  }

  return {
    id: typeof data.id === "string" ? data.id : "",
    slug: data.slug,
    name: typeof data.name === "string" ? data.name : data.slug,
    description: typeof data.description === "string" ? data.description : "",
    enabled: data.enabled === true,
  };
}

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function unwrapData(output: unknown): Record<string, unknown> | null {
  const envelope = asRecord(output);
  if (!envelope || envelope.ok !== true) {
    return null;
  }

  const data = envelope.data;
  if (!data || typeof data !== "object") {
    return null;
  }

  return data as Record<string, unknown>;
}

function asRecord(value: unknown): Record<string, unknown> | null {
  if (typeof value === "object" && value !== null && !Array.isArray(value)) {
    return value as Record<string, unknown>;
  }
  return null;
}
