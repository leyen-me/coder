import { AlertCircle, ChevronDown, ChevronUp } from "lucide-react";
import { useCallback, useEffect, useMemo, useState } from "react";

import { resolveDefaultModel } from "@/features/agent/model-preference";
import { resolveDefaultThinkingEnabled } from "@/features/agent/thinking-preference";
import {
  buildCronFromSimple,
  isValidCronExpression,
  normalizeCronExpression,
  parseCronToSimple,
  type SimpleSchedule,
} from "@/features/scheduled-jobs/lib/cron-expression";
import { resolveInitialSessionWorkspaceDir } from "@/features/workspace/resolve-session-workspace";
import { Button } from "@/components/ui/button";
import {
  Collapsible,
  CollapsibleContent,
  CollapsibleTrigger,
} from "@/components/ui/collapsible";
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
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Textarea } from "@/components/ui/textarea";
import { ToggleGroup, ToggleGroupItem } from "@/components/ui/toggle-group";
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

const DEFAULT_WEEKLY_DAYS = [1, 2, 3, 4, 5];

function createDefaultSimpleSchedule(): SimpleSchedule {
  return {
    kind: "daily",
    time: "09:00",
  };
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
  const [simpleSchedule, setSimpleSchedule] = useState<SimpleSchedule>(
    createDefaultSimpleSchedule
  );
  const [advancedOnly, setAdvancedOnly] = useState(false);
  const [advancedOpen, setAdvancedOpen] = useState(false);
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

  const weekdayOptions = useMemo(
    () => [
      { value: 1, label: t("automations.weekdayMonday") },
      { value: 2, label: t("automations.weekdayTuesday") },
      { value: 3, label: t("automations.weekdayWednesday") },
      { value: 4, label: t("automations.weekdayThursday") },
      { value: 5, label: t("automations.weekdayFriday") },
      { value: 6, label: t("automations.weekdaySaturday") },
      { value: 0, label: t("automations.weekdaySunday") },
    ],
    [t]
  );

  const applySimpleSchedule = useCallback((nextSchedule: SimpleSchedule) => {
    setSimpleSchedule(nextSchedule);
    setAdvancedOnly(false);
    try {
      setCronExpression(buildCronFromSimple(nextSchedule));
    } catch {
      setCronExpression("");
    }
  }, []);

  const syncScheduleFromCron = useCallback((nextCronExpression: string) => {
    setCronExpression(nextCronExpression);
    const parsed = parseCronToSimple(nextCronExpression);
    if (parsed) {
      setSimpleSchedule(parsed);
      setAdvancedOnly(false);
    } else {
      setAdvancedOnly(true);
      setAdvancedOpen(true);
    }
  }, []);

  useEffect(() => {
    if (!open) {
      return;
    }

    if (editItem) {
      const runConfig = resolveScheduledJobRunConfig(editItem, { models: allModels });
      const parsedSchedule = parseCronToSimple(editItem.cronExpression);
      setName(editItem.name);
      setDescription(editItem.description);
      if (parsedSchedule) {
        setSimpleSchedule(parsedSchedule);
        setCronExpression(buildCronFromSimple(parsedSchedule));
        setAdvancedOnly(false);
        setAdvancedOpen(false);
      } else {
        setSimpleSchedule(createDefaultSimpleSchedule());
        setCronExpression(editItem.cronExpression.trim());
        setAdvancedOnly(true);
        setAdvancedOpen(true);
      }
      setPrompt(editItem.prompt);
      setWorkspaceDir(runConfig.workspaceDir);
      setModel(runConfig.model);
      setAgentMode(runConfig.agentMode);
      setThinkingEnabled(runConfig.thinkingEnabled);
    } else {
      const defaultModel = resolveDefaultModel({ models: allModels });
      const defaultSchedule = createDefaultSimpleSchedule();
      setName("");
      setDescription("");
      setSimpleSchedule(defaultSchedule);
      setCronExpression(buildCronFromSimple(defaultSchedule));
      setAdvancedOnly(false);
      setAdvancedOpen(false);
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

    let normalizedCron: string | null;
    if (!advancedOnly) {
      try {
        normalizedCron = buildCronFromSimple(simpleSchedule);
      } catch {
        setError(t("automations.formScheduleInvalid"));
        return;
      }
    } else {
      normalizedCron = normalizeCronExpression(cronExpression);
    }

    if (!normalizedCron || !isValidCronExpression(normalizedCron)) {
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
      cronExpression: normalizedCron,
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
    advancedOnly,
    cronExpression,
    description,
    editItem,
    model,
    modelProviders,
    name,
    onOpenChange,
    onSave,
    prompt,
    simpleSchedule,
    t,
    thinkingEnabled,
    workspaceDir,
  ]);

  const schedulePreview = !advancedOnly ? normalizeCronExpression(cronExpression) : null;

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

            <div className="space-y-3 rounded-xl border border-border/60 p-3">
              <div className="space-y-1">
                <Label>{t("automations.fieldSchedule")}</Label>
                <p className="text-xs text-muted-foreground">
                  {t("automations.scheduleUtcHint")}
                </p>
              </div>

              {advancedOnly ? (
                <div className="rounded-lg border border-dashed border-border/70 bg-muted/30 px-3 py-2">
                  <p className="text-sm text-muted-foreground">
                    {t("automations.scheduleAdvancedOnly")}
                  </p>
                  <Button
                    type="button"
                    variant="outline"
                    size="sm"
                    className="mt-3"
                    onClick={() => applySimpleSchedule(createDefaultSimpleSchedule())}
                  >
                    {t("automations.scheduleUseSimpleMode")}
                  </Button>
                </div>
              ) : (
                <>
                  <div className="grid gap-3 sm:grid-cols-2">
                    <div className="space-y-1.5">
                      <Label htmlFor="automation-schedule-kind">
                        {t("automations.scheduleFrequency")}
                      </Label>
                      <Select
                        value={simpleSchedule.kind}
                        disabled={saving}
                        onValueChange={(value) => {
                          const nextKind = value as SimpleSchedule["kind"];
                          if (nextKind === simpleSchedule.kind) {
                            return;
                          }
                          if (nextKind === "daily") {
                            applySimpleSchedule({
                              kind: "daily",
                              time: simpleSchedule.time,
                            });
                            return;
                          }
                          applySimpleSchedule({
                            kind: "weekly",
                            time: simpleSchedule.time,
                            weekdays:
                              simpleSchedule.kind === "weekly" &&
                              simpleSchedule.weekdays.length > 0
                                ? simpleSchedule.weekdays
                                : DEFAULT_WEEKLY_DAYS,
                          });
                        }}
                      >
                        <SelectTrigger id="automation-schedule-kind" className="w-full">
                          <SelectValue />
                        </SelectTrigger>
                        <SelectContent>
                          <SelectItem value="daily">
                            {t("automations.scheduleFrequencyDaily")}
                          </SelectItem>
                          <SelectItem value="weekly">
                            {t("automations.scheduleFrequencyWeekly")}
                          </SelectItem>
                        </SelectContent>
                      </Select>
                    </div>

                    <div className="space-y-1.5">
                      <Label htmlFor="automation-schedule-time">
                        {t("automations.scheduleTime")}
                      </Label>
                      <Input
                        id="automation-schedule-time"
                        type="time"
                        step={60}
                        disabled={saving}
                        value={simpleSchedule.time}
                        onChange={(event) => {
                          const nextTime = event.target.value;
                          if (simpleSchedule.kind === "daily") {
                            applySimpleSchedule({
                              kind: "daily",
                              time: nextTime,
                            });
                            return;
                          }
                          applySimpleSchedule({
                            kind: "weekly",
                            time: nextTime,
                            weekdays: simpleSchedule.weekdays,
                          });
                        }}
                      />
                    </div>
                  </div>

                  {simpleSchedule.kind === "weekly" ? (
                    <div className="space-y-1.5">
                      <Label>{t("automations.scheduleWeekdays")}</Label>
                      <ToggleGroup
                        type="multiple"
                        variant="outline"
                        size="sm"
                        className="w-full flex-wrap"
                        disabled={saving}
                        value={simpleSchedule.weekdays.map(String)}
                        onValueChange={(values) =>
                          applySimpleSchedule({
                            kind: "weekly",
                            time: simpleSchedule.time,
                            weekdays: values.map((value) => Number.parseInt(value, 10)),
                          })
                        }
                      >
                        {weekdayOptions.map((option) => (
                          <ToggleGroupItem
                            key={option.value}
                            value={String(option.value)}
                            className="min-w-10 flex-1"
                          >
                            {option.label}
                          </ToggleGroupItem>
                        ))}
                      </ToggleGroup>
                    </div>
                  ) : null}

                  {schedulePreview ? (
                    <p className="text-xs text-muted-foreground">
                      {t("automations.scheduleCronPreview")}{" "}
                      <code className="rounded bg-muted px-1.5 py-0.5 font-mono text-[11px]">
                        {schedulePreview}
                      </code>
                    </p>
                  ) : null}
                </>
              )}

              <Collapsible open={advancedOpen} onOpenChange={setAdvancedOpen}>
                <CollapsibleTrigger asChild>
                  <Button
                    type="button"
                    variant="ghost"
                    size="sm"
                    className="-ml-2 h-auto justify-start px-2 text-muted-foreground"
                  >
                    {advancedOpen ? (
                      <ChevronUp className="mr-1 size-4" />
                    ) : (
                      <ChevronDown className="mr-1 size-4" />
                    )}
                    {t("automations.scheduleAdvancedToggle")}
                  </Button>
                </CollapsibleTrigger>

                <CollapsibleContent className="space-y-2 pt-2">
                  <div className="space-y-1.5">
                    <Label htmlFor="automation-cron">{t("automations.fieldCron")}</Label>
                    <Input
                      id="automation-cron"
                      disabled={saving}
                      value={cronExpression}
                      onChange={(event) => syncScheduleFromCron(event.target.value)}
                      placeholder="0 9 * * 1-5"
                    />
                  </div>
                  <p className="text-xs text-muted-foreground">
                    {t("automations.fieldCronHint")}
                  </p>
                </CollapsibleContent>
              </Collapsible>
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
