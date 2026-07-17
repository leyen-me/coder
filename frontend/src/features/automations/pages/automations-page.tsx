import { Plus } from "lucide-react";
import { useCallback, useState } from "react";

import { PagePlaceholder } from "@/components/layout/page-placeholder";
import { Button } from "@/components/ui/button";
import { useTranslation } from "@/lib/i18n/locale-provider";
import type {
  CreateScheduledJobInput,
  ScheduledJobRecord,
  UpdateScheduledJobInput,
} from "@/features/scheduled-jobs/lib/api";
import { useScheduledJobs } from "@/features/scheduled-jobs/hooks/use-scheduled-jobs";
import type { ScheduledJobViewModel } from "@/features/scheduled-jobs/lib/types";

import { AutomationCard } from "../components/automation-card";
import { AutomationDialog } from "../components/automation-dialog";
import { DeleteAutomationDialog } from "../components/delete-automation-dialog";

export function AutomationsPage() {
  const { t } = useTranslation();
  const { items, loading, create, update, remove, toggle, runNow } =
    useScheduledJobs();
  const [dialogOpen, setDialogOpen] = useState(false);
  const [editItem, setEditItem] = useState<ScheduledJobRecord | null>(null);
  const [deleteTarget, setDeleteTarget] = useState<ScheduledJobViewModel | null>(
    null
  );

  const handleCreate = useCallback(() => {
    setEditItem(null);
    setDialogOpen(true);
  }, []);

  const handleEdit = useCallback((item: ScheduledJobViewModel) => {
    setEditItem(item);
    setDialogOpen(true);
  }, []);

  const handleSave = useCallback(
    async (
      input: CreateScheduledJobInput | (UpdateScheduledJobInput & { id: string })
    ): Promise<void> => {
      if ("id" in input) {
        const { id, ...patch } = input;
        await update(id, patch);
      } else {
        await create(input);
      }
    },
    [create, update]
  );

  const handleDelete = useCallback(
    async (id: string) => {
      await remove(id);
      setDeleteTarget(null);
    },
    [remove]
  );

  const handleToggle = useCallback(
    async (id: string, enabled: boolean) => {
      await toggle(id, enabled);
    },
    [toggle]
  );

  const handleRun = useCallback(
    (id: string) => {
      void runNow(id);
    },
    [runNow]
  );

  if (loading) {
    return <PagePlaceholder title={t("automations.title")} />;
  }

  return (
    <div className="h-full overflow-y-auto">
      <div className="mx-auto max-w-3xl space-y-6 p-4 md:p-6">
        <div className="flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
          <div>
            <h1 className="text-xl font-semibold tracking-tight md:text-2xl">
              {t("automations.title")}
            </h1>
            <p className="mt-1 text-sm text-muted-foreground">
              {t("automations.description")}
            </p>
          </div>
          <Button className="w-full shrink-0 sm:w-auto" onClick={handleCreate} variant="outline">
            <Plus className="size-4" />
            {t("automations.newAutomation")}
          </Button>
        </div>

        {items.length === 0 ? (
          <div className="flex flex-col items-center justify-center rounded-lg border border-dashed py-16 text-center">
            <p className="mb-4 text-sm text-muted-foreground">
              {t("automations.empty")}
            </p>
            <Button variant="outline" onClick={handleCreate}>
              <Plus className="h-4 w-4" />
              {t("automations.createFirst")}
            </Button>
          </div>
        ) : (
          <div className="grid gap-4">
            {items.map((item) => (
              <AutomationCard
                key={item.id}
                item={item}
                onToggle={handleToggle}
                onRun={handleRun}
                onEdit={handleEdit}
                onDelete={(id) => {
                  const target = items.find((entry) => entry.id === id) ?? null;
                  setDeleteTarget(target);
                }}
              />
            ))}
          </div>
        )}
      </div>

      <AutomationDialog
        open={dialogOpen}
        onOpenChange={setDialogOpen}
        editItem={editItem}
        onSave={handleSave}
      />

      <DeleteAutomationDialog
        open={deleteTarget !== null}
        onOpenChange={(nextOpen) => {
          if (!nextOpen) {
            setDeleteTarget(null);
          }
        }}
        automationName={deleteTarget?.name ?? ""}
        onConfirm={() => {
          if (deleteTarget) {
            void handleDelete(deleteTarget.id);
          }
        }}
      />
    </div>
  );
}
