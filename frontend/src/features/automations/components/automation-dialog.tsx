import { AlertCircle } from "lucide-react";
import { useCallback, useEffect, useState } from "react";

import { resolveDefaultModel } from "@/features/agent/model-preference";
import { resolveDefaultThinkingEnabled } from "@/features/agent/thinking-preference";
import { resolveInitialSessionWorkspaceDir } from "@/features/workspace/resolve-session-workspace";
import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { useTranslation } from "@/lib/i18n/locale-provider";
import { findModelDefinition } from "@/lib/model-provider/model-definition";
import { useModelProvider } from "@/lib/model-provider/model-provider-provider";

import type {
  CreateScheduledJobInput,
  ScheduledJobAgentMode,
  ScheduledJobRecord,
  UpdateScheduledJobInput,
} from "@/features/scheduled-jobs/lib/api";
import { resolveScheduledJobRunConfig } from "@/features/scheduled-jobs/lib/run-config";
import { AutomationRunSettings } from "./automation-run-settings";

type AutomationDialogProps = {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  editItem: ScheduledJobRecord | null;
  onSave: (
    input: CreateScheduledJobInput | (UpdateScheduledJobInput & { id: string })
  ) => Promise<void>;
};

function isLikelyCronExpression(value: string): boolean {
  const trimmed = value.trim();
  if (!trimmed) {
    return false;
  }
  const parts = trimmed.split(/\s+/);
  if (parts.length !== 5 && parts.length !== 6) {
    return false;
  }
  return parts.every((part) => /^[\d*/,\-]+$/.test(part));
}

export function AutomationDialog({
  open,
  onOpenChange,
  editItem,
  onSave,
}: AutomationDialogProps) {
  const { t } = useTranslation();
  const { allModels, modelProviders } = useModelProvider();
  const isEditing = editItem !== null;
  const [name, setName] = useState("");
  const [description, setDescription] = useState("");
  const [cronExpression, setCronExpression] = useState("");
  const [prompt, setPrompt] = useState("");
  const [workspaceDir, setWorkspaceDir] = useState<string | null>(null);
  const [model, setModel] = useState(() => resolveDefaultModel({ models: allModels }));
  const [agentMode, setAgentMode] = useState<ScheduledJobAgentMode>("agent");
  const [thinkingEnabled, setThinkingEnabled] = useState(false);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const handleModelChange = useCallback(
    (nextModel: string) => {
      setModel(nextModel);
      setThinkingEnabled(
        resolveDefaultThinkingEnabled(findModelDefinition(allModels, nextModel))
      );
    },
    [allModels]
  );

  useEffect(() => {
    if (!open) {
      return;
    }

    if (editItem) {
      const runConfig = resolveScheduledJobRunConfig(editItem, { models: allModels });
      setName(editItem.name);
      setDescription(editItem.description);
      setCronExpression(editItem.cronExpression);
      setPrompt(editItem.prompt);
      setWorkspaceDir(runConfig.workspaceDir);
      setModel(runConfig.model);
      setAgentMode(runConfig.agentMode);
      setThinkingEnabled(runConfig.thinkingEnabled);
    } else {
      const defaultModel = resolveDefaultModel({ models: allModels });
      setName("");
      setDescription("");
      setCronExpression("0 * * * *");
      setPrompt("");
      setWorkspaceDir(resolveInitialSessionWorkspaceDir());
      setModel(defaultModel);
      setAgentMode("agent");
      setThinkingEnabled(
        resolveDefaultThinkingEnabled(findModelDefinition(allModels, defaultModel))
      );
    }
    setError(null);
    setSaving(false);
  }, [allModels, editItem, open]);

  const handleSave = useCallback(async () => {
    setError(null);

    const trimmedName = name.trim();
    if (!trimmedName) {
      setError(t("automations.formNameRequired"));
      return;
    }

    const trimmedCron = cronExpression.trim();
    if (!isLikelyCronExpression(trimmedCron)) {
      setError(t("automations.formCronInvalid"));
      return;
    }

    const trimmedPrompt = prompt.trim();
    if (!trimmedPrompt) {
      setError(t("automations.formPromptRequired"));
      return;
    }

    const trimmedModel = model.trim();
    if (!trimmedModel || !findModelDefinition(allModels, trimmedModel)) {
      setError(t("automations.formModelRequired"));
      return;
    }

    const inferredProvider = modelProviders?.get(trimmedModel) ?? "custom";
    const payload = {
      name: trimmedName,
      description: description.trim(),
      cronExpression: trimmedCron,
      prompt: trimmedPrompt,
      workspaceDir: workspaceDir?.trim() || null,
      model: trimmedModel,
      provider: inferredProvider,
      agentMode,
      thinkingEnabled,
    };

    setSaving(true);
    try {
      if (editItem) {
        await onSave({
          id: editItem.id,
          ...payload,
          enabled: editItem.enabled,
        });
      } else {
        await onSave(payload);
      }
      onOpenChange(false);
    } catch {
      setError(t("automations.saveFailed"));
    } finally {
      setSaving(false);
    }
  }, [
    agentMode,
    allModels,
    cronExpression,
    description,
    editItem,
    model,
    modelProviders,
    name,
    onOpenChange,
    onSave,
    prompt,
    t,
    thinkingEnabled,
    workspaceDir,
  ]);

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="flex max-h-[min(100dvh-2rem,88dvh)] flex-col gap-0 overflow-hidden p-0 sm:max-h-[min(640px,85vh)] sm:max-w-lg">
        <DialogHeader className="shrink-0 space-y-1 px-4 pb-2 pt-4 sm:px-6 sm:pt-6">
          <DialogTitle>
            {isEditing
              ? t("automations.editAutomation")
              : t("automations.newAutomation")}
          </DialogTitle>
          {!isEditing ? (
            <DialogDescription>{t("automations.description")}</DialogDescription>
          ) : null}
        </DialogHeader>

        <div className="min-h-0 flex-1 overflow-y-auto px-4 py-1 sm:px-6">
          <div className="space-y-3">
            <div className="grid gap-3 sm:grid-cols-2">
              <div className="space-y-1.5">
                <Label htmlFor="automation-name">{t("automations.fieldName")}</Label>
                <Input
                  id="automation-name"
                  value={name}
                  onChange={(event) => setName(event.target.value)}
                  placeholder={t("automations.fieldNamePlaceholder")}
                />
              </div>

              <div className="space-y-1.5">
                <Label htmlFor="automation-description">
                  {t("automations.fieldDescription")}
                </Label>
                <Input
                  id="automation-description"
                  value={description}
                  onChange={(event) => setDescription(event.target.value)}
                  placeholder={t("automations.fieldDescriptionPlaceholder")}
                />
              </div>
            </div>

            <div className="space-y-1.5">
              <Label htmlFor="automation-cron">{t("automations.fieldCron")}</Label>
              <Input
                id="automation-cron"
                value={cronExpression}
                onChange={(event) => setCronExpression(event.target.value)}
                placeholder="0 9 * * 1-5"
              />
              <p className="text-xs text-muted-foreground">
                {t("automations.fieldCronHint")}
              </p>
            </div>

            <AutomationRunSettings
              workspaceDir={workspaceDir}
              onWorkspaceDirChange={setWorkspaceDir}
              agentMode={agentMode}
              onAgentModeChange={setAgentMode}
              model={model}
              onModelChange={handleModelChange}
              thinkingEnabled={thinkingEnabled}
              onThinkingEnabledChange={setThinkingEnabled}
              models={allModels}
              modelProviders={modelProviders}
              disabled={saving}
            />

            <div className="space-y-1.5">
              <Label htmlFor="automation-prompt">
                {t("automations.fieldPrompt")}
              </Label>
              <Textarea
                id="automation-prompt"
                value={prompt}
                onChange={(event) => setPrompt(event.target.value)}
                placeholder={t("automations.fieldPromptPlaceholder")}
                rows={6}
                className="min-h-28 resize-y"
              />
              <p className="text-xs text-muted-foreground">
                {t("automations.fieldPromptHint")}
              </p>
            </div>

            {error ? (
              <p className="flex items-center gap-1 text-sm text-destructive">
                <AlertCircle className="h-4 w-4" />
                {error}
              </p>
            ) : null}
          </div>
        </div>

        <DialogFooter className="shrink-0 border-t border-border/60 px-4 py-3 sm:px-6 sm:py-4">
          <Button variant="outline" onClick={() => onOpenChange(false)}>
            {t("automations.cancel")}
          </Button>
          <Button onClick={handleSave} disabled={saving}>
            {saving
              ? t("automations.saving")
              : isEditing
                ? t("automations.save")
                : t("automations.create")}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
