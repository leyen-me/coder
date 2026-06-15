import { useState, useEffect, useCallback } from "react";
import { AlertCircle, Check, ChevronsUpDown } from "lucide-react";

import type { AgentMode } from "@/features/agent/types";
import { resolveDefaultModel } from "@/features/agent/model-preference";
import { resolveDefaultThinkingEnabled } from "@/features/agent/thinking-preference";
import { resolveInitialSessionWorkspaceDir } from "@/features/workspace/resolve-session-workspace";
import { Button } from "@/components/ui/button";
import { Checkbox } from "@/components/ui/checkbox";
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
import {
  Popover,
  PopoverContent,
  PopoverTrigger,
} from "@/components/ui/popover";
import {
  Command,
  CommandEmpty,
  CommandGroup,
  CommandInput,
  CommandItem,
  CommandList,
} from "@/components/ui/command";
import { useTranslation } from "@/lib/i18n/locale-provider";
import { findModelDefinition } from "@/lib/model-provider/model-definition";
import { useModelProvider } from "@/lib/model-provider/model-provider-provider";
import { cn } from "@/lib/utils";

import type { AutomationRecord, CreateAutomationInput, UpdateAutomationInput } from "@/lib/db";
import { AutomationRunSettings } from "./automation-run-settings";
import { resolveAutomationRunConfig } from "../lib/run-config";
import { CRON_PRESETS, isValidCronExpression } from "../lib/types";

type AutomationDialogProps = {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  /** Pass an item to edit, or null to create a new automation. */
  editItem: AutomationRecord | null;
  onSave: (
    input: CreateAutomationInput | (UpdateAutomationInput & { id: string })
  ) => Promise<void>;
};

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
  const [agentMode, setAgentMode] = useState<AgentMode>("agent");
  const [thinkingEnabled, setThinkingEnabled] = useState(false);
  const [enableEmail, setEnableEmail] = useState(false);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [presetOpen, setPresetOpen] = useState(false);

  const handleModelChange = useCallback(
    (nextModel: string) => {
      setModel(nextModel);
      setThinkingEnabled(
        resolveDefaultThinkingEnabled(
          findModelDefinition(allModels, nextModel)
        )
      );
    },
    [allModels]
  );

  useEffect(() => {
    if (open) {
      if (editItem) {
        const runConfig = resolveAutomationRunConfig(editItem, { models: allModels });
        setName(editItem.name);
        setDescription(editItem.description);
        setCronExpression(editItem.cronExpression);
        setPrompt(editItem.prompt);
        setWorkspaceDir(runConfig.workspaceDir);
        setModel(runConfig.model);
        setAgentMode(runConfig.agentMode);
        setThinkingEnabled(runConfig.thinkingEnabled);
        setEnableEmail(editItem.enableEmail);
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
          resolveDefaultThinkingEnabled(
            findModelDefinition(allModels, defaultModel)
          )
        );
        setEnableEmail(false);
      }
      setError(null);
      setSaving(false);
    }
  }, [open, editItem, allModels]);

  const handleSave = useCallback(async () => {
    setError(null);

    const trimmedName = name.trim();
    if (!trimmedName) {
      setError(t("automations.formNameRequired"));
      return;
    }

    const trimmedCron = cronExpression.trim();
    if (!trimmedCron || !isValidCronExpression(trimmedCron)) {
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

    const runSettings = {
      workspaceDir: workspaceDir?.trim() || null,
      model: trimmedModel,
      provider: inferredProvider,
      agentMode,
      thinkingEnabled,
      enableEmail,
    };

    setSaving(true);
    try {
      if (isEditing) {
        await onSave({
          id: editItem.id,
          name: trimmedName,
          description: description.trim(),
          cronExpression: trimmedCron,
          prompt: trimmedPrompt,
          ...runSettings,
        } as UpdateAutomationInput & { id: string });
      } else {
        await onSave({
          name: trimmedName,
          description: description.trim(),
          cronExpression: trimmedCron,
          prompt: trimmedPrompt,
          ...runSettings,
        } as CreateAutomationInput);
      }
      onOpenChange(false);
    } catch (err) {
      setError(t("automations.saveFailed"));
    } finally {
      setSaving(false);
    }
  }, [
    name,
    cronExpression,
    prompt,
    description,
    workspaceDir,
    model,
    agentMode,
    thinkingEnabled,
    enableEmail,
    allModels,
    isEditing,
    editItem,
    onSave,
    onOpenChange,
    t,
    modelProviders,
  ]);

  const cronValid = cronExpression.trim() === "" || isValidCronExpression(cronExpression.trim());

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="flex max-h-[min(640px,85vh)] flex-col gap-0 overflow-hidden p-0 sm:max-w-lg">
        <DialogHeader className="shrink-0 space-y-1 px-6 pt-6 pb-2">
          <DialogTitle>
            {isEditing ? t("automations.editAutomation") : t("automations.newAutomation")}
          </DialogTitle>
          {!isEditing ? (
            <DialogDescription>{t("automations.description")}</DialogDescription>
          ) : null}
        </DialogHeader>

        <div className="min-h-0 flex-1 overflow-y-auto px-6 py-1">
          <div className="space-y-3">
          <div className="grid gap-3 sm:grid-cols-2">
            <div className="space-y-1.5">
              <Label htmlFor="automation-name">{t("automations.fieldName")}</Label>
              <Input
                id="automation-name"
                value={name}
                onChange={(e) => setName(e.target.value)}
                placeholder={t("automations.fieldNamePlaceholder")}
              />
            </div>

            <div className="space-y-1.5">
              <Label htmlFor="automation-description">{t("automations.fieldDescription")}</Label>
              <Input
                id="automation-description"
                value={description}
                onChange={(e) => setDescription(e.target.value)}
                placeholder={t("automations.fieldDescriptionPlaceholder")}
              />
            </div>
          </div>

          <div className="space-y-1.5">
            <Label htmlFor="automation-cron">{t("automations.fieldCron")}</Label>
            <div className="flex gap-2">
              <Input
                id="automation-cron"
                value={cronExpression}
                onChange={(e) => setCronExpression(e.target.value)}
                placeholder="0 9 * * 1-5"
                className={cn(!cronValid && "border-destructive")}
              />
              <Popover modal={false} open={presetOpen} onOpenChange={setPresetOpen}>
                <PopoverTrigger asChild>
                  <Button variant="outline" size="icon" className="shrink-0" aria-label={t("automations.fieldCronPresets")}>
                    <ChevronsUpDown className="h-4 w-4" />
                  </Button>
                </PopoverTrigger>
                <PopoverContent
                  className="w-72 p-0"
                  align="end"
                  onOpenAutoFocus={(event) => {
                    event.preventDefault();
                  }}
                  onWheel={(event) => {
                    event.stopPropagation();
                  }}
                >
                  <Command>
                    <CommandInput placeholder={t("automations.fieldCronPresets")} />
                    <CommandList className="overscroll-contain">
                      <CommandEmpty>{t("automations.fieldCronPresets")}</CommandEmpty>
                      <CommandGroup heading={t("automations.fieldCronPresets")}>
                        {CRON_PRESETS.map((preset) => {
                          const presetLabel = t(preset.labelKey);
                          return (
                          <CommandItem
                            key={preset.expression}
                            value={`${presetLabel} ${preset.expression}`}
                            onSelect={() => {
                              setCronExpression(preset.expression);
                              setPresetOpen(false);
                            }}
                          >
                            <Check
                              className={cn(
                                "mr-2 h-4 w-4",
                                cronExpression === preset.expression
                                  ? "opacity-100"
                                  : "opacity-0"
                              )}
                            />
                            <span className="flex-1">{presetLabel}</span>
                            <code className="text-xs text-muted-foreground ml-2">
                              {preset.expression}
                            </code>
                          </CommandItem>
                          );
                        })}
                      </CommandGroup>
                    </CommandList>
                  </Command>
                </PopoverContent>
              </Popover>
            </div>
            {!cronValid && (
              <p className="text-xs text-destructive flex items-center gap-1 mt-1">
                <AlertCircle className="h-3 w-3" />
                {t("automations.fieldCronInvalid")}
              </p>
            )}
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

          <div className="flex items-center gap-2 rounded-lg border border-border/60 px-3 py-2.5">
            <Checkbox
              id="automation-enable-email"
              checked={enableEmail}
              onCheckedChange={(checked) => setEnableEmail(checked === true)}
              disabled={saving}
            />
            <Label
              htmlFor="automation-enable-email"
              className="cursor-pointer text-sm font-normal"
            >
              <span>{t("automations.fieldEnableEmail")}</span>
            </Label>
          </div>

          <div className="space-y-1.5">
            <Label htmlFor="automation-prompt">{t("automations.fieldPrompt")}</Label>
            <Textarea
              id="automation-prompt"
              value={prompt}
              onChange={(e) => setPrompt(e.target.value)}
              placeholder={t("automations.fieldPromptPlaceholder")}
              rows={3}
              className="min-h-20 resize-y"
            />
            <p className="text-xs text-muted-foreground">
              {t("automations.fieldPromptHint")}
            </p>
          </div>

          {error && (
            <p className="text-sm text-destructive flex items-center gap-1">
              <AlertCircle className="h-4 w-4" />
              {error}
            </p>
          )}
          </div>
        </div>

        <DialogFooter className="shrink-0 border-t border-border/60 px-6 py-4">
          <Button variant="outline" onClick={() => onOpenChange(false)}>
            {t("automations.cancel")}
          </Button>
          <Button onClick={handleSave} disabled={saving}>
            {saving ? t("automations.saving") : isEditing ? t("automations.save") : t("automations.create")}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
