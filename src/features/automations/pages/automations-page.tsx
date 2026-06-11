import { useState, useCallback } from "react";
import { Plus } from "lucide-react";

import { Button } from "@/components/ui/button";
import { PagePlaceholder } from "@/components/layout/page-placeholder";
import { useTranslation } from "@/lib/i18n/locale-provider";
import type { AutomationRecord, CreateAutomationInput, UpdateAutomationInput } from "@/lib/db";

import { useAutomations } from "../hooks/use-automations";
import { AutomationCard } from "../components/automation-card";
import { AutomationDialog } from "../components/automation-dialog";
import { DeleteAutomationDialog } from "../components/delete-automation-dialog";

import type { AutomationViewModel } from "../lib/types";

export function AutomationsPage() {
  const { t } = useTranslation();
  const { items, loading, create, update, remove, toggle, runNow } =
    useAutomations();

  const [dialogOpen, setDialogOpen] = useState(false);
  const [editItem, setEditItem] = useState<AutomationRecord | null>(null);
  const [deleteTarget, setDeleteTarget] = useState<AutomationViewModel | null>(
    null
  );

  const handleCreate = useCallback(async () => {
    setEditItem(null);
    setDialogOpen(true);
  }, []);

  const handleEdit = useCallback((item: AutomationViewModel) => {
    setEditItem(item);
    setDialogOpen(true);
  }, []);

  const handleSave = useCallback(
    async (
      input: CreateAutomationInput | (UpdateAutomationInput & { id: string })
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
    return <PagePlaceholder title={t("pages.automations.title")} />;
  }

  return (
    <div className="h-full overflow-y-auto">
      <div className="mx-auto max-w-2xl space-y-6 p-6">
        {/* Header */}
        <div className="flex items-center justify-between">
          <div>
            <h1 className="text-2xl font-semibold tracking-tight">
              {t("pages.automations.title")}
            </h1>
            <p className="text-sm text-muted-foreground mt-1">
              {t("automations.description")}
            </p>
          </div>
          <Button onClick={handleCreate}>
            <Plus className="h-4 w-4 mr-2" />
            {t("automations.newAutomation")}
          </Button>
        </div>

        {/* List */}
        {items.length === 0 ? (
          <div className="flex flex-col items-center justify-center rounded-lg border border-dashed py-16 text-center">
            <p className="text-sm text-muted-foreground mb-4">
              {t("automations.empty")}
            </p>
            <Button variant="outline" onClick={handleCreate}>
              <Plus className="h-4 w-4 mr-2" />
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
                  const target = items.find((i) => i.id === id) ?? null;
                  setDeleteTarget(target);
                }}
              />
            ))}
          </div>
        )}
      </div>

      {/* Create / Edit dialog */}
      <AutomationDialog
        open={dialogOpen}
        onOpenChange={setDialogOpen}
        editItem={editItem}
        onSave={handleSave}
      />

      {/* Delete confirmation */}
      <DeleteAutomationDialog
        open={deleteTarget !== null}
        onOpenChange={(open) => {
          if (!open) setDeleteTarget(null);
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
