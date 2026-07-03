import { useCallback, useEffect, useState } from "react";

import { listEnabledSkillsForTools } from "@/features/skills/lib/resolve-skills";
import type { SkillListItem } from "@/features/skills/types";
import { subscribeDb } from "@/lib/db";

export function useEnabledSkills(open: boolean) {
  const [skills, setSkills] = useState<SkillListItem[]>([]);
  const [loading, setLoading] = useState(false);

  const refresh = useCallback(async () => {
    setLoading(true);
    try {
      setSkills(await listEnabledSkillsForTools());
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    if (!open) {
      return;
    }

    void refresh();
    return subscribeDb(() => {
      void refresh();
    });
  }, [open, refresh]);

  return { skills, loading, refresh };
}

export function filterEnabledSkills(
  skills: SkillListItem[],
  query: string
): SkillListItem[] {
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
