import { PlusIcon, Trash2Icon } from "lucide-react";

import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import {
  createModelDefinition,
  DEFAULT_MODEL_CONTEXT_WINDOW,
  type ModelDefinition,
} from "@/lib/model-provider/model-definition";
import { useLocale } from "@/lib/i18n/locale-provider";

import {
  createDefaultThinkingConfig,
  ThinkingConfigEditor,
} from "./thinking-config-editor";

type CustomModelsEditorProps = {
  models: ModelDefinition[];
  onChange: (models: ModelDefinition[]) => void;
};

type CustomModelRowProps = {
  model: ModelDefinition;
  onChange: (model: ModelDefinition) => void;
  onRemove: () => void;
};

function CustomModelRow({ model, onChange, onRemove }: CustomModelRowProps) {
  const { t } = useLocale();

  return (
    <div className="space-y-3 rounded-lg border border-input bg-muted/20 p-3">
      <div className="flex items-start gap-2">
        <div className="grid flex-1 gap-3 sm:grid-cols-2">
          <div className="space-y-1.5">
            <label className="text-xs font-medium text-muted-foreground">
              {t("settings.modelProvider.modelIdLabel")}
            </label>
            <Input
              value={model.id}
              onChange={(event) =>
                onChange({ ...model, id: event.target.value })
              }
              placeholder={t("settings.modelProvider.modelIdPlaceholder")}
              aria-label={t("settings.modelProvider.modelIdAriaLabel")}
              className="font-mono text-sm"
            />
          </div>

          <div className="space-y-1.5">
            <label className="text-xs font-medium text-muted-foreground">
              {t("settings.modelProvider.modelLabelLabel")}
            </label>
            <Input
              value={model.label ?? ""}
              onChange={(event) =>
                onChange({
                  ...model,
                  label: event.target.value.trim() || undefined,
                })
              }
              placeholder={t("settings.modelProvider.modelLabelPlaceholder")}
              aria-label={t("settings.modelProvider.modelLabelAriaLabel")}
              className="text-sm"
            />
          </div>

          <div className="space-y-1.5 sm:col-span-2">
            <label className="text-xs font-medium text-muted-foreground">
              {t("settings.modelProvider.contextWindowLabel")}
            </label>
            <Input
              type="number"
              min={1}
              step={1}
              value={model.contextWindow}
              onChange={(event) => {
                const parsed = Number.parseInt(event.target.value, 10);
                onChange({
                  ...model,
                  contextWindow:
                    Number.isFinite(parsed) && parsed > 0
                      ? parsed
                      : DEFAULT_MODEL_CONTEXT_WINDOW,
                });
              }}
              aria-label={t("settings.modelProvider.contextWindowAriaLabel")}
              className="font-mono text-sm"
            />
          </div>
        </div>

        <Button
          type="button"
          variant="ghost"
          size="icon-sm"
          onClick={onRemove}
          aria-label={t("settings.modelProvider.removeModelAriaLabel")}
          className="shrink-0 text-muted-foreground hover:text-destructive"
        >
          <Trash2Icon className="size-4" />
        </Button>
      </div>

      <div className="flex flex-wrap gap-4">
        <label className="flex items-center gap-2 text-sm">
          <input
            type="checkbox"
            checked={model.supportsThinking}
            onChange={(event) => {
              const supportsThinking = event.target.checked;
              onChange({
                ...model,
                supportsThinking,
                thinkingConfig: supportsThinking
                  ? (model.thinkingConfig ?? createDefaultThinkingConfig())
                  : undefined,
              });
            }}
            className="size-4 rounded border-input"
          />
          {t("settings.modelProvider.supportsThinkingLabel")}
        </label>

        <label className="flex items-center gap-2 text-sm">
          <input
            type="checkbox"
            checked={model.supportsMultimodal}
            onChange={(event) =>
              onChange({ ...model, supportsMultimodal: event.target.checked })
            }
            className="size-4 rounded border-input"
          />
          {t("settings.modelProvider.supportsMultimodalLabel")}
        </label>
      </div>

      {model.supportsThinking && model.thinkingConfig ? (
        <ThinkingConfigEditor
          config={model.thinkingConfig}
          onChange={(thinkingConfig) => onChange({ ...model, thinkingConfig })}
        />
      ) : null}
    </div>
  );
}

function normalizeModels(models: ModelDefinition[]): ModelDefinition[] {
  const seen = new Set<string>();
  const normalized: ModelDefinition[] = [];

  for (const model of models) {
    const id = model.id.trim();
    if (!id || seen.has(id)) {
      continue;
    }

    seen.add(id);
    normalized.push(createModelDefinition(id, model));
  }

  return normalized;
}

export function CustomModelsEditor({ models, onChange }: CustomModelsEditorProps) {
  const { t } = useLocale();

  const handleModelChange = (index: number, nextModel: ModelDefinition) => {
    const next = [...models];
    next[index] = nextModel;
    onChange(normalizeModels(next));
  };

  const handleRemove = (index: number) => {
    onChange(models.filter((_, itemIndex) => itemIndex !== index));
  };

  const handleAdd = () => {
    onChange([
      ...models,
      createModelDefinition("", {
        contextWindow: DEFAULT_MODEL_CONTEXT_WINDOW,
      }),
    ]);
  };

  return (
    <div className="space-y-3">
      {models.length === 0 ? (
        <p className="rounded-lg border border-dashed border-input px-3 py-4 text-sm text-muted-foreground">
          {t("settings.modelProvider.emptyModelsHint")}
        </p>
      ) : (
        models.map((model, index) => (
          <CustomModelRow
            key={`${model.id}-${index}`}
            model={model}
            onChange={(nextModel) => handleModelChange(index, nextModel)}
            onRemove={() => handleRemove(index)}
          />
        ))
      )}

      <Button type="button" variant="outline" size="sm" onClick={handleAdd}>
        <PlusIcon className="size-4" />
        {t("settings.modelProvider.addModelButton")}
      </Button>
    </div>
  );
}
