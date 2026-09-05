import { AlertCircle, CalendarClockIcon, ChevronDown } from "lucide-react";
import { useCallback, useEffect, useMemo, useState } from "react";

import {
  composerFooterControlClassName,
} from "@/components/ai-elements/composer-footer-control";
import { resolveDefaultModelValue } from "@/features/agent/model-preference";
import { resolveDefaultThinkingEnabled } from "@/features/agent/thinking-preference";
import {
  buildCronFromSimple,
  isValidCronExpression,
  normalizeCronExpression,
  parseCronToSimple,
  type SimpleSchedule,
} from "@/features/scheduled-jobs/lib/cron-expression";
import { resolveInitialSessionWorkspaceDir } from "@/features/workspace/resolve-session-workspace";
import { listMcpServers } from "@/lib/db/mcp-servers";
import type { McpServerConfig } from "@/lib/db";
import { Button } from "@/components/ui/button";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuRadioGroup,
  DropdownMenuRadioItem,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
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
import { ToggleGroup, ToggleGroupItem } from "@/components/ui/toggle-group";
import { useTranslation } from "@/lib/i18n/locale-provider";
import { useModelProvider } from "@/lib/model-provider/model-provider-provider";
import {
  findModelEntry,
  parseModelValue,
} from "@/lib/model-provider/resolve-provider-config";
import { cn } from "@/lib/utils";

import type {
  CreateScheduledJobInput,
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
  const { modelEntries, getProviderLabel } = useModelProvider();
  const isEditing = editItem !== null;
  const [name, setName] = useState("");
  const [description, setDescription] = useState("");
  const [cronExpression, setCronExpression] = useState("");
  const [simpleSchedule, setSimpleSchedule] = useState<SimpleSchedule>(
    createDefaultSimpleSchedule
  );
  const [advancedOnly, setAdvancedOnly] = useState(false);
  const [prompt, setPrompt] = useState("");
  const [workspaceDir, setWorkspaceDir] = useState<string | null>(null);
  const [model, setModel] = useState(() => resolveDefaultModelValue(modelEntries));
  const [thinkingEnabled, setThinkingEnabled] = useState(false);
  const [enabledMcpServers, setEnabledMcpServers] = useState<McpServerConfig[]>([]);
  const [attachedMcpServers, setAttachedMcpServers] = useState<string[]>([]);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (!open) {
      return;
    }
    let cancelled = false;
    void listMcpServers()
      .then((servers) => {
        if (!cancelled) {
          setEnabledMcpServers(servers.filter((server) => server.enabled));
        }
      })
      .catch(() => {});
    return () => {
      cancelled = true;
    };
  }, [open]);

  const handleToggleMcpServer = useCallback((serverId: string) => {
    setAttachedMcpServers((prev) =>
      prev.includes(serverId)
        ? prev.filter((id) => id !== serverId)
        : [...prev, serverId],
    );
  }, []);

  const handleModelChange = useCallback(
    (nextModel: string) => {
      setModel(nextModel);
      setThinkingEnabled(
        resolveDefaultThinkingEnabled(
          findModelEntry(modelEntries, nextModel)?.model
        )
      );
    },
    [modelEntries]
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
    }
  }, []);

  useEffect(() => {
    if (!open) {
      return;
    }

    if (editItem) {
      const runConfig = resolveScheduledJobRunConfig(editItem, modelEntries);
      const parsedSchedule = parseCronToSimple(editItem.cronExpression);
      setName(editItem.name);
      setDescription(editItem.description);
      if (parsedSchedule) {
        setSimpleSchedule(parsedSchedule);
        setCronExpression(buildCronFromSimple(parsedSchedule));
        setAdvancedOnly(false);
      } else {
        setSimpleSchedule(createDefaultSimpleSchedule());
        setCronExpression(editItem.cronExpression.trim());
        setAdvancedOnly(true);
      }
      setPrompt(editItem.prompt);
      setWorkspaceDir(runConfig.workspaceDir);
      setModel(runConfig.model);
      setThinkingEnabled(runConfig.thinkingEnabled);
      setAttachedMcpServers(editItem.attachedMcpServers ?? []);
    } else {
      const defaultModel = resolveDefaultModelValue(modelEntries);
      const defaultSchedule = createDefaultSimpleSchedule();
      setName("");
      setDescription("");
      setSimpleSchedule(defaultSchedule);
      setCronExpression(buildCronFromSimple(defaultSchedule));
      setAdvancedOnly(false);
      setPrompt("");
      setWorkspaceDir(resolveInitialSessionWorkspaceDir());
      setModel(defaultModel);
      setThinkingEnabled(
        resolveDefaultThinkingEnabled(
          findModelEntry(modelEntries, defaultModel)?.model
        )
      );
      setAttachedMcpServers([]);
    }
    setError(null);
    setSaving(false);
  }, [modelEntries, editItem, open]);

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
    if (!trimmedModel || !findModelEntry(modelEntries, trimmedModel)) {
      setError(t("automations.formModelRequired"));
      return;
    }

    const inferredProvider =
      parseModelValue(trimmedModel).providerId ||
      editItem?.provider ||
      "custom";
    const payload = {
      name: trimmedName,
      description: description.trim(),
      cronExpression: normalizedCron,
      prompt: trimmedPrompt,
      workspaceDir: workspaceDir?.trim() || null,
      model: parseModelValue(trimmedModel).modelId,
      provider: inferredProvider,
      thinkingEnabled,
      attachedMcpServers,
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
    attachedMcpServers,
    modelEntries,
    advancedOnly,
    cronExpression,
    description,
    editItem,
    model,
    name,
    onOpenChange,
    onSave,
    prompt,
    simpleSchedule,
    t,
    thinkingEnabled,
    workspaceDir,
  ]);

  const frequencyLabel =
    simpleSchedule.kind === "daily"
      ? t("automations.scheduleFrequencyDaily")
      : t("automations.scheduleFrequencyWeekly");

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
              <Label>{t("automations.fieldSchedule")}</Label>

              <div className="grid gap-3 sm:grid-cols-2">
                <div className="space-y-1.5">
                  <Label htmlFor="automation-schedule-kind">
                    {t("automations.scheduleFrequency")}
                  </Label>
                  <DropdownMenu modal={false}>
                    <DropdownMenuTrigger asChild>
                      <button
                        id="automation-schedule-kind"
                        type="button"
                        disabled={saving}
                        className={cn(
                          composerFooterControlClassName,
                          "inline-flex h-9 w-full min-w-0 items-center justify-between gap-1.5 rounded-xl border border-transparent bg-input/50 px-3 text-foreground",
                          "hover:bg-input/70 data-[state=open]:border-ring data-[state=open]:bg-input/70 data-[state=open]:text-foreground"
                        )}
                        title={frequencyLabel}
                      >
                        <span className="inline-flex min-w-0 items-center gap-1.5">
                          <CalendarClockIcon className="size-3.5 shrink-0 text-muted-foreground" />
                          <span className="truncate">{frequencyLabel}</span>
                        </span>
                        <ChevronDown className="size-3.5 shrink-0 opacity-60" />
                      </button>
                    </DropdownMenuTrigger>
                    <DropdownMenuContent align="start" className="min-w-40">
                      <DropdownMenuRadioGroup
                        value={simpleSchedule.kind}
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
                        <DropdownMenuRadioItem value="daily">
                          {t("automations.scheduleFrequencyDaily")}
                        </DropdownMenuRadioItem>
                        <DropdownMenuRadioItem value="weekly">
                          {t("automations.scheduleFrequencyWeekly")}
                        </DropdownMenuRadioItem>
                      </DropdownMenuRadioGroup>
                    </DropdownMenuContent>
                  </DropdownMenu>
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
                    className="rounded-xl"
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

              <Input
                id="automation-cron"
                disabled={saving}
                value={cronExpression}
                onChange={(event) => syncScheduleFromCron(event.target.value)}
                placeholder="0 9 * * 1-5"
                className="h-10 rounded-xl border-border/60 bg-background/80"
              />
            </div>

            <AutomationRunSettings
              workspaceDir={workspaceDir}
              onWorkspaceDirChange={setWorkspaceDir}
              model={model}
              onModelChange={handleModelChange}
              thinkingEnabled={thinkingEnabled}
              onThinkingEnabledChange={setThinkingEnabled}
              entries={modelEntries}
              getProviderLabel={getProviderLabel}
              mcpServers={enabledMcpServers}
              attachedMcpServers={attachedMcpServers}
              onToggleMcpServer={handleToggleMcpServer}
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
