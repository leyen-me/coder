import { useCallback, useEffect, useState } from "react";

import {
  resolveDefaultThinkingEnabled,
  writeThinkingPreference,
} from "@/features/agent/thinking-preference";
import {
  findModelDefinition,
  type ModelDefinition,
} from "@/lib/model-provider/model-definition";

export function useComposerThinking(
  modelId: string,
  models: readonly ModelDefinition[]
) {
  const [thinkingEnabled, setThinkingEnabled] = useState(() =>
    resolveDefaultThinkingEnabled(findModelDefinition(models, modelId))
  );

  useEffect(() => {
    setThinkingEnabled(
      resolveDefaultThinkingEnabled(findModelDefinition(models, modelId))
    );
  }, [modelId, models]);

  const onThinkingEnabledChange = useCallback(
    (enabled: boolean) => {
      setThinkingEnabled(enabled);
      writeThinkingPreference(modelId, enabled);
    },
    [modelId]
  );

  return { thinkingEnabled, onThinkingEnabledChange };
}
