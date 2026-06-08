import type { ModelDefinition } from "@/lib/model-provider/model-definition";

import { ModelCapabilityBadges } from "./model-capability-badges";

type PresetModelsListProps = {
  models: readonly ModelDefinition[];
};

export function PresetModelsList({ models }: PresetModelsListProps) {
  return (
    <ul className="divide-y rounded-lg border border-input bg-muted/30">
      {models.map((model) => (
        <li key={model.id} className="space-y-2 px-2.5 py-2.5">
          <div className="space-y-0.5">
            <p className="font-mono text-sm text-foreground">{model.id}</p>
            {model.label && model.label !== model.id ? (
              <p className="text-xs text-muted-foreground">{model.label}</p>
            ) : null}
          </div>
          <ModelCapabilityBadges className="flex flex-wrap gap-1.5" model={model} />
        </li>
      ))}
    </ul>
  );
}
