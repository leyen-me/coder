import { useCallback, useEffect, useState } from "react";

import {
  resolveDefaultThinkingEnabled,
  writeThinkingPreference,
} from "@/features/agent/thinking-preference";
import {
  findModelDefinition,
  type ModelDefinition,
} from "@/lib/model-provider/model-definition";
import { parseModelValue } from "@/lib/model-provider/resolve-provider-config";

export function useComposerThinking(
  modelValue: string,
  models: readonly ModelDefinition[]
) {
  const modelId = parseModelValue(modelValue).modelId;

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
