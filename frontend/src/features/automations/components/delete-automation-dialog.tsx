import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from "@/components/ui/alert-dialog";
import { useTranslation } from "@/lib/i18n/locale-provider";

type DeleteAutomationDialogProps = {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  automationName: string;
  onConfirm: () => void;
};

export function DeleteAutomationDialog({
  open,
  onOpenChange,
  automationName,
  onConfirm,
}: DeleteAutomationDialogProps) {
  const { t } = useTranslation();

  return (
    <AlertDialog open={open} onOpenChange={onOpenChange}>
      <AlertDialogContent>
        <AlertDialogHeader>
          <AlertDialogTitle>
            {t("automations.deleteConfirmTitle")}
          </AlertDialogTitle>
          <AlertDialogDescription>
            {t("automations.deleteConfirmDescription", {
              name: automationName,
            })}
          </AlertDialogDescription>
        </AlertDialogHeader>
        <AlertDialogFooter>
          <AlertDialogCancel>{t("automations.cancel")}</AlertDialogCancel>
          <AlertDialogAction
            onClick={onConfirm}
            className="bg-destructive text-destructive-foreground hover:bg-destructive/90"
          >
            {t("automations.delete")}
          </AlertDialogAction>
        </AlertDialogFooter>
      </AlertDialogContent>
    </AlertDialog>
  );
}
