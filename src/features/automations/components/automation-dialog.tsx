import { useState, useEffect, useCallback } from "react";
import { AlertCircle, Check, ChevronsUpDown } from "lucide-react";

import type { AgentMode } from "@/features/agent/types";
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
  const { resolved } = useModelProvider();
  const isEditing = editItem !== null;
  const [name, setName] = useState("");
  const [description, setDescription] = useState("");
  const [cronExpression, setCronExpression] = useState("");
  const [prompt, setPrompt] = useState("");
  const [workspaceDir, setWorkspaceDir] = useState<string | null>(null);
  const [model, setModel] = useState(() => resolveDefaultModel(resolved));
  const [agentMode, setAgentMode] = useState<AgentMode>("agent");
  const [thinkingEnabled, setThinkingEnabled] = useState(false);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [presetOpen, setPresetOpen] = useState(false);

  const handleModelChange = useCallback(
    (nextModel: string) => {
      setModel(nextModel);
      setThinkingEnabled(
        resolveDefaultThinkingEnabled(
          findModelDefinition(resolved.models, nextModel)
        )
      );
    },
    [resolved.models]
  );

  useEffect(() => {
    if (open) {
      if (editItem) {
        const runConfig = resolveAutomationRunConfig(editItem, resolved);
        setName(editItem.name);
        setDescription(editItem.description);
        setCronExpression(editItem.cronExpression);
        setPrompt(editItem.prompt);
        setWorkspaceDir(runConfig.workspaceDir);
        setModel(runConfig.model);
        setAgentMode(runConfig.agentMode);
        setThinkingEnabled(runConfig.thinkingEnabled);
      } else {
        const defaultModel = resolveDefaultModel(resolved);
        setName("");
        setDescription("");
        setCronExpression("0 * * * *");
        setPrompt("");
        setWorkspaceDir(resolveInitialSessionWorkspaceDir());
        setModel(defaultModel);
        setAgentMode("agent");
        setThinkingEnabled(
          resolveDefaultThinkingEnabled(
            findModelDefinition(resolved.models, defaultModel)
          )
        );
      }
      setError(null);
      setSaving(false);
    }
  }, [open, editItem, resolved]);

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
    if (!trimmedModel || !findModelDefinition(resolved.models, trimmedModel)) {
      setError(t("automations.formModelRequired"));
      return;
    }

    const runSettings = {
      workspaceDir: workspaceDir?.trim() || null,
      model: trimmedModel,
      agentMode,
      thinkingEnabled,
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
    resolved.models,
    isEditing,
    editItem,
    onSave,
    onOpenChange,
    t,
  ]);

  const cronValid = cronExpression.trim() === "" || isValidCronExpression(cronExpression.trim());

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-lg max-h-[90vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle>
            {isEditing ? t("automations.editAutomation") : t("automations.newAutomation")}
          </DialogTitle>
          <DialogDescription>
            {isEditing
              ? t("automations.editAutomation")
              : t("automations.description")}
          </DialogDescription>
        </DialogHeader>

        <div className="space-y-4 py-2">
          {/* Name */}
          <div className="space-y-2">
            <Label htmlFor="automation-name">{t("automations.fieldName")}</Label>
            <Input
              id="automation-name"
              value={name}
              onChange={(e) => setName(e.target.value)}
              placeholder={t("automations.fieldNamePlaceholder")}
            />
          </div>

          {/* Description */}
          <div className="space-y-2">
            <Label htmlFor="automation-description">{t("automations.fieldDescription")}</Label>
            <Input
              id="automation-description"
              value={description}
              onChange={(e) => setDescription(e.target.value)}
              placeholder={t("automations.fieldDescriptionPlaceholder")}
            />
          </div>

          {/* Cron expression */}
          <div className="space-y-2">
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
            models={resolved.models}
            disabled={saving}
          />

          {/* Prompt */}
          <div className="space-y-2">
            <Label htmlFor="automation-prompt">{t("automations.fieldPrompt")}</Label>
            <Textarea
              id="automation-prompt"
              value={prompt}
              onChange={(e) => setPrompt(e.target.value)}
              placeholder={t("automations.fieldPromptPlaceholder")}
              rows={5}
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

        <DialogFooter>
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
