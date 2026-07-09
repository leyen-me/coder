import { useCallback, useEffect, useState } from "react";

import {
  deleteUserSkillBySlug,
} from "../api";
import { getUserSkillCards } from "../lib/resolve-skills";
import type { UserSkillCardViewModel } from "../types";

export function useSkills() {
  const [userSkills, setUserSkills] = useState<UserSkillCardViewModel[]>([]);
  const [userSkillsRootPath, setUserSkillsRootPath] = useState("");
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const refresh = useCallback(async () => {
    try {
      const user = await getUserSkillCards();
      setUserSkills(user.skills);
      setUserSkillsRootPath(user.rootPath);
      setError(null);
    } catch (cause) {
      console.error("Failed to load skills", cause);
      setError(cause instanceof Error ? cause.message : "Failed to load skills");
      setUserSkills([]);
      setUserSkillsRootPath("");
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    void refresh();
  }, [refresh]);

  const removeUserSkill = useCallback(async (slug: string) => {
    await deleteUserSkillBySlug(slug);
    await refresh();
  }, []);

  return {
    userSkills,
    userSkillsRootPath,
    loading,
    error,
    refresh,
    removeUserSkill,
  };
}
