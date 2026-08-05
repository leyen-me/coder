import { FileJson, FileText } from "lucide-react";
import { useCallback, useState } from "react";
import { toast } from "sonner";

import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Spinner } from "@/components/ui/spinner";
import {
  exportSessionAsJson,
  exportSessionAsMarkdown,
} from "@/features/chat/lib/export-session";
import { useTranslation } from "@/lib/i18n/locale-provider";
import { cn } from "@/lib/utils";

type ExportFormat = "markdown" | "json";

type ExportSessionDialogProps = {
  /** The session to export. `null` renders the dialog as closed. */
  sessionId: string | null;
  open: boolean;
  onOpenChange: (open: boolean) => void;
};

/**
 * Format chooser shown when the user triggers "Export" on a session.
 * Markdown is a readable summary; JSON is the full uncompressed raw dump.
 */
export function ExportSessionDialog({
  sessionId,
  open,
  onOpenChange,
}: ExportSessionDialogProps) {
  const { t } = useTranslation();
  const [exporting, setExporting] = useState<ExportFormat | null>(null);

  const handleExport = useCallback(
    async (format: ExportFormat) => {
      if (!sessionId || exporting) {
        return;
      }
      setExporting(format);
      try {
        const exported =
          format === "json"
            ? await exportSessionAsJson(sessionId)
            : await exportSessionAsMarkdown(sessionId);
        if (!exported) {
          throw new Error("Session not found");
        }
        toast.success(
          format === "json"
            ? t("sidebar.exportChatJsonSuccess")
            : t("sidebar.exportChatSuccess")
        );
        onOpenChange(false);
      } catch {
        toast.error(
          format === "json"
            ? t("sidebar.exportChatJsonFailed")
            : t("sidebar.exportChatFailed")
        );
      } finally {
        setExporting(null);
      }
    },
    [exporting, onOpenChange, sessionId, t]
  );

  const options: {
    format: ExportFormat;
    icon: typeof FileJson;
    label: string;
    description: string;
  }[] = [
    {
      format: "markdown",
      icon: FileText,
      label: t("sidebar.exportChatMarkdown"),
      description: t("sidebar.exportChatMarkdownDescription"),
    },
    {
      format: "json",
      icon: FileJson,
      label: t("sidebar.exportChatJson"),
      description: t("sidebar.exportChatJsonDescription"),
    },
  ];

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-md">
        <DialogHeader>
          <DialogTitle>{t("sidebar.exportChatDialogTitle")}</DialogTitle>
          <DialogDescription>
            {t("sidebar.exportChatDialogDescription")}
          </DialogDescription>
        </DialogHeader>

        <div className="grid gap-2">
          {options.map((option) => {
            const isExporting = exporting === option.format;
            const Icon = option.icon;
            return (
              <button
                key={option.format}
                type="button"
                disabled={exporting !== null}
                onClick={() => handleExport(option.format)}
                className={cn(
                  "flex w-full items-center gap-3 rounded-2xl border border-input bg-background p-3 text-left transition-colors",
                  "hover:bg-accent hover:text-accent-foreground",
                  "focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring",
                  "disabled:pointer-events-none disabled:opacity-60"
                )}
              >
                <Icon className="size-4 shrink-0 text-muted-foreground" />
                <span className="min-w-0 flex-1">
                  <span className="block text-sm font-medium">
                    {option.label}
                  </span>
                  <span className="block text-xs text-muted-foreground">
                    {option.description}
                  </span>
                </span>
                {isExporting ? <Spinner className="size-4" /> : null}
              </button>
            );
          })}
        </div>

        <DialogFooter>
          <Button
            variant="outline"
            disabled={exporting !== null}
            onClick={() => onOpenChange(false)}
          >
            {t("settings.data.confirmCancel")}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
