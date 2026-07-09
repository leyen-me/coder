import { useCallback, useEffect, useState } from "react";

import { listAvailableSkills } from "@/features/skills/api";
import type { AvailableSkill } from "@/features/skills/types";

export function useAvailableSkills(
  workspaceDir: string | null | undefined,
  open: boolean
) {
  const [skills, setSkills] = useState<AvailableSkill[]>([]);
  const [loading, setLoading] = useState(false);

  const refresh = useCallback(async () => {
    setLoading(true);
    try {
      const response = await listAvailableSkills(workspaceDir);
      setSkills(response.skills);
    } finally {
      setLoading(false);
    }
  }, [workspaceDir]);

  useEffect(() => {
    if (!open) {
      return;
    }

    void refresh();
  }, [open, refresh]);

  return { skills, loading, refresh };
}

export function filterAvailableSkills(
  skills: AvailableSkill[],
  query: string
): AvailableSkill[] {
  const normalized = query.trim().toLowerCase();
  if (!normalized) {
    return skills;
  }

  return skills.filter(
    (skill) =>
      skill.slug.includes(normalized) ||
      skill.name.toLowerCase().includes(normalized) ||
      skill.description.toLowerCase().includes(normalized)
  );
}
