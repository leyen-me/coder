import { useCallback, useEffect, useRef, useState } from "react";
import { PlusIcon, Trash2Icon } from "lucide-react";

import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import {
  createModelDefinition,
  DEFAULT_MODEL_CONTEXT_WINDOW,
  normalizeEditableModelDefinitions,
  type ModelDefinition,
} from "@/lib/model-provider/model-definition";
import type { ProviderId } from "@/lib/model-provider/types";
import { useLocale } from "@/lib/i18n/locale-provider";
import { randomUUID } from "@/lib/random-id";

import {
  createDefaultThinkingConfig,
  ThinkingConfigEditor,
} from "./thinking-config-editor";

const PERSIST_DEBOUNCE_MS = 300;

type CustomModelsEditorProps = {
  models: ModelDefinition[];
  onChange: (models: ModelDefinition[]) => void;
  provider: ProviderId;
};

type ModelRow = {
  rowKey: string;
  model: ModelDefinition;
};

type CustomModelRowProps = {
  model: ModelDefinition;
  provider: ProviderId;
  onChange: (model: ModelDefinition) => void;
  onRemove: () => void;
};

function toModelRows(models: ModelDefinition[], rowKeys: string[]): ModelRow[] {
  return models.map((model, index) => ({
    rowKey: rowKeys[index] ?? randomUUID(),
    model,
  }));
}

function CustomModelRow({
  model,
  provider,
  onChange,
  onRemove,
}: CustomModelRowProps) {
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
                  label: event.target.value || undefined,
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
                  ? (model.thinkingConfig ??
                    createDefaultThinkingConfig(provider))
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

export function CustomModelsEditor({
  models,
  onChange,
  provider,
}: CustomModelsEditorProps) {
  const { t } = useLocale();
  const rowKeysRef = useRef<string[]>(models.map(() => randomUUID()));
  const [rows, setRows] = useState<ModelRow[]>(() =>
    toModelRows(models, rowKeysRef.current)
  );
  const rowsRef = useRef(rows);
  rowsRef.current = rows;
  const persistTimeoutRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const skipExternalSyncRef = useRef(false);

  const flushPersist = useCallback(() => {
    if (persistTimeoutRef.current) {
      clearTimeout(persistTimeoutRef.current);
      persistTimeoutRef.current = null;
    }

    skipExternalSyncRef.current = true;
    onChange(
      normalizeEditableModelDefinitions(
        rowsRef.current.map((row) => row.model)
      )
    );
  }, [onChange]);

  const schedulePersist = useCallback(() => {
    if (persistTimeoutRef.current) {
      clearTimeout(persistTimeoutRef.current);
    }

    persistTimeoutRef.current = setTimeout(() => {
      persistTimeoutRef.current = null;
      flushPersist();
    }, PERSIST_DEBOUNCE_MS);
  }, [flushPersist]);

  useEffect(() => {
    if (skipExternalSyncRef.current) {
      skipExternalSyncRef.current = false;
      return;
    }

    rowKeysRef.current = models.map(
      (_, index) => rowKeysRef.current[index] ?? randomUUID()
    );
    const nextRows = toModelRows(models, rowKeysRef.current);
    rowsRef.current = nextRows;
    setRows(nextRows);
  }, [models]);

  useEffect(() => {
    return () => {
      if (!persistTimeoutRef.current) {
        return;
      }

      clearTimeout(persistTimeoutRef.current);
      persistTimeoutRef.current = null;
      flushPersist();
    };
  }, [flushPersist]);

  const updateRows = useCallback(
    (updater: (current: ModelRow[]) => ModelRow[], options?: { immediate?: boolean }) => {
      setRows((current) => {
        const next = updater(current);
        rowsRef.current = next;
        if (options?.immediate) {
          flushPersist();
        } else {
          schedulePersist();
        }
        return next;
      });
    },
    [flushPersist, schedulePersist]
  );

  const handleModelChange = (index: number, nextModel: ModelDefinition) => {
    updateRows((current) =>
      current.map((row, rowIndex) =>
        rowIndex === index ? { ...row, model: nextModel } : row
      )
    );
  };

  const handleRemove = (index: number) => {
    updateRows((current) => {
      rowKeysRef.current = rowKeysRef.current.filter(
        (_, rowIndex) => rowIndex !== index
      );
      return current.filter((_, rowIndex) => rowIndex !== index);
    }, { immediate: true });
  };

  const handleAdd = () => {
    updateRows((current) => {
      const rowKey = randomUUID();
      rowKeysRef.current = [...rowKeysRef.current, rowKey];
      return [
        ...current,
        {
          rowKey,
          model: createModelDefinition("", {
            contextWindow: DEFAULT_MODEL_CONTEXT_WINDOW,
          }),
        },
      ];
    }, { immediate: true });
  };

  const handleContainerBlur = (event: React.FocusEvent<HTMLDivElement>) => {
    const nextTarget = event.relatedTarget;
    if (nextTarget instanceof Node && event.currentTarget.contains(nextTarget)) {
      return;
    }

    flushPersist();
  };

  return (
    <div className="space-y-3" onBlur={handleContainerBlur}>
      {rows.length === 0 ? (
        <p className="rounded-lg border border-dashed border-input px-3 py-4 text-sm text-muted-foreground">
          {t("settings.modelProvider.emptyModelsHint")}
        </p>
      ) : (
        rows.map((row, index) => (
          <CustomModelRow
            key={row.rowKey}
            model={row.model}
            provider={provider}
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
