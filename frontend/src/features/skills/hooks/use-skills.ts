import { useCallback, useEffect, useState } from "react";

import {
  deleteUserSkill,
  setSystemSkillEnabled,
  subscribeDb,
  updateUserSkill,
} from "@/lib/db";

import {
  getSystemSkillCards,
  getSystemSkillCardsSync,
  getUserSkillCards,
} from "../lib/resolve-skills";
import type { SkillCardViewModel } from "../types";

export function useSkills() {
  const [systemSkills, setSystemSkills] = useState<SkillCardViewModel[]>([]);
  const [userSkills, setUserSkills] = useState<SkillCardViewModel[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const refresh = useCallback(async () => {
    try {
      const [system, user] = await Promise.all([
        getSystemSkillCards(),
        getUserSkillCards(),
      ]);
      setSystemSkills(system);
      setUserSkills(user);
      setError(null);
    } catch (cause) {
      console.error("Failed to load skills", cause);
      setError(cause instanceof Error ? cause.message : "Failed to load skills");
      setSystemSkills(getSystemSkillCardsSync());
      setUserSkills([]);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    void refresh();
    return subscribeDb(() => {
      void refresh();
    });
  }, [refresh]);

  const setSystemEnabled = useCallback(
    async (skillId: string, enabled: boolean) => {
      await setSystemSkillEnabled(skillId, enabled);
    },
    []
  );

  const setUserEnabled = useCallback(async (skillId: string, enabled: boolean) => {
    await updateUserSkill(skillId, { enabled });
  }, []);

  const removeUserSkill = useCallback(async (skillId: string) => {
    await deleteUserSkill(skillId);
  }, []);

  return {
    systemSkills,
    userSkills,
    loading,
    error,
    refresh,
    setSystemEnabled,
    setUserEnabled,
    removeUserSkill,
  };
}
