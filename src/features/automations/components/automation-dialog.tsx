import { useState, useEffect, useCallback } from "react";
import { AlertCircle, Check, ChevronsUpDown } from "lucide-react";

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
import { cn } from "@/lib/utils";

import type { AutomationRecord, CreateAutomationInput, UpdateAutomationInput } from "@/lib/db";
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
  const isEditing = editItem !== null;
  const [name, setName] = useState("");
  const [description, setDescription] = useState("");
  const [cronExpression, setCronExpression] = useState("");
  const [prompt, setPrompt] = useState("");
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [presetOpen, setPresetOpen] = useState(false);

  useEffect(() => {
    if (open) {
      if (editItem) {
        setName(editItem.name);
        setDescription(editItem.description);
        setCronExpression(editItem.cronExpression);
        setPrompt(editItem.prompt);
      } else {
        setName("");
        setDescription("");
        setCronExpression("0 * * * *");
        setPrompt("");
      }
      setError(null);
      setSaving(false);
    }
  }, [open, editItem]);

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

    setSaving(true);
    try {
      if (isEditing) {
        await onSave({
          id: editItem.id,
          name: trimmedName,
          description: description.trim(),
          cronExpression: trimmedCron,
          prompt: trimmedPrompt,
        } as UpdateAutomationInput & { id: string });
      } else {
        await onSave({
          name: trimmedName,
          description: description.trim(),
          cronExpression: trimmedCron,
          prompt: trimmedPrompt,
        } as CreateAutomationInput);
      }
      onOpenChange(false);
    } catch (err) {
      setError(t("automations.saveFailed"));
    } finally {
      setSaving(false);
    }
  }, [name, cronExpression, prompt, description, isEditing, editItem, onSave, onOpenChange, t]);

  const cronValid = cronExpression.trim() === "" || isValidCronExpression(cronExpression.trim());

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-lg">
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
              <Popover open={presetOpen} onOpenChange={setPresetOpen}>
                <PopoverTrigger asChild>
                  <Button variant="outline" size="icon" className="shrink-0" aria-label={t("automations.fieldCronPresets")}>
                    <ChevronsUpDown className="h-4 w-4" />
                  </Button>
                </PopoverTrigger>
                <PopoverContent className="w-72 p-0" align="end">
                  <Command>
                    <CommandInput placeholder={t("automations.fieldCronPresets")} />
                    <CommandList>
                      <CommandEmpty>{t("automations.fieldCronPresets")}</CommandEmpty>
                      <CommandGroup heading={t("automations.fieldCronPresets")}>
                        {CRON_PRESETS.map((preset) => (
                          <CommandItem
                            key={preset.expression}
                            value={`${preset.label} ${preset.expression}`}
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
                            <span className="flex-1">{preset.label}</span>
                            <code className="text-xs text-muted-foreground ml-2">
                              {preset.expression}
                            </code>
                          </CommandItem>
                        ))}
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
