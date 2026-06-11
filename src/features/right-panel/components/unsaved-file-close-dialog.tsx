"use client";

import {
  AlertDialog,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from "@/components/ui/alert-dialog";
import { Button } from "@/components/ui/button";
import { useTranslation } from "@/lib/i18n/locale-provider";

type UnsavedFileCloseDialogProps = {
  fileName: string | null;
  isSaving: boolean;
  onDiscard: () => void;
  onOpenChange: (open: boolean) => void;
  onSave: () => void;
  open: boolean;
};

export function UnsavedFileCloseDialog({
  fileName,
  isSaving,
  onDiscard,
  onOpenChange,
  onSave,
  open,
}: UnsavedFileCloseDialogProps) {
  const { t } = useTranslation();

  return (
    <AlertDialog onOpenChange={onOpenChange} open={open}>
      <AlertDialogContent>
        <AlertDialogHeader>
          <AlertDialogTitle>{t("rightPanel.previewCloseUnsavedTitle")}</AlertDialogTitle>
          <AlertDialogDescription>
            {t("rightPanel.previewCloseUnsavedDescription", {
              name: fileName ?? "",
            })}
          </AlertDialogDescription>
        </AlertDialogHeader>
        <AlertDialogFooter>
          <AlertDialogCancel disabled={isSaving}>
            {t("rightPanel.dialogCancel")}
          </AlertDialogCancel>
          <Button
            disabled={isSaving}
            onClick={onDiscard}
            type="button"
            variant="outline"
          >
            {t("rightPanel.previewCloseDiscard")}
          </Button>
          <Button disabled={isSaving} onClick={onSave} type="button">
            {isSaving ? t("rightPanel.previewSaving") : t("rightPanel.previewSave")}
          </Button>
        </AlertDialogFooter>
      </AlertDialogContent>
    </AlertDialog>
  );
}
