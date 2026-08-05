import {
  DownloadIcon,
  FolderOpenIcon,
  MoreHorizontalIcon,
  PencilIcon,
  PinIcon,
  PinOffIcon,
} from "lucide-react";
import { useCallback, useEffect, useState } from "react";
import { toast } from "sonner";

import {
  Dialog,
  DialogContent,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { Input } from "@/components/ui/input";
import { ProviderUsageTag } from "@/features/lab/provider-usage-tag";
import { openWorkspaceInExplorer } from "@/features/workspace/open-workspace-in-explorer";
import { ExportSessionDialog } from "@/features/chat/components/export-session-dialog";
import { pinSession, unpinSession, updateSessionTitle } from "@/lib/db";
import { useTranslation } from "@/lib/i18n/locale-provider";

type SessionToolbarProps = {
  sessionProvider?: string | null;
};

export function SessionToolbar({
  sessionProvider,
}: SessionToolbarProps) {
  return (
    <div className="flex min-w-0 shrink items-center gap-0.5 sm:gap-1">
      <div className="hidden sm:block">
        <ProviderUsageTag providerId={sessionProvider} />
      </div>
    </div>
  );
}

type SessionTitleActionsProps = {
  chatId: string | null;
  title?: string;
  isPinned?: boolean;
  workspaceDir?: string | null;
};

export function SessionTitleActions({
  chatId,
  title,
  isPinned,
  workspaceDir,
}: SessionTitleActionsProps) {
  const { t } = useTranslation();
  const hasWorkspace = Boolean(workspaceDir?.trim());
  const [renameOpen, setRenameOpen] = useState(false);
  const [renameValue, setRenameValue] = useState("");
  const [exportOpen, setExportOpen] = useState(false);

  // Reset rename input when dialog opens
  useEffect(() => {
    if (renameOpen) {
      setRenameValue(title ?? "");
    }
  }, [renameOpen, title]);

  const handleOpenInExplorer = useCallback(() => {
    const path = workspaceDir?.trim();
    if (!path) return;
    void (async () => {
      const result = await openWorkspaceInExplorer(path);
      if (result.ok) return;
      toast.error(result.message || t("session.openWorkspaceInExplorerFailed"));
    })();
  }, [t, workspaceDir]);

  const handleExport = useCallback(() => {
    if (!chatId) return;
    setExportOpen(true);
  }, [chatId]);

  const handleRenameSave = useCallback(() => {
    if (!chatId || !renameValue.trim()) return;
    void (async () => {
      await updateSessionTitle(chatId, renameValue.trim());
      setRenameOpen(false);
    })();
  }, [chatId, renameValue]);

  const handleTogglePin = useCallback(() => {
    if (!chatId) return;
    void (async () => {
      if (isPinned) {
        await unpinSession(chatId);
      } else {
        await pinSession(chatId);
      }
    })();
  }, [chatId, isPinned]);

  const hasMenu = Boolean(chatId) || hasWorkspace;
  if (!hasMenu) return null;

  return (
    <>
      <DropdownMenu>
        <DropdownMenuTrigger asChild>
          <button
            aria-label={t("session.sessionActions")}
            className="-mr-1 flex size-6 shrink-0 items-center justify-center rounded-md text-muted-foreground opacity-60 transition-opacity hover:opacity-100 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
            type="button"
          >
            <MoreHorizontalIcon className="size-4" />
          </button>
        </DropdownMenuTrigger>
        <DropdownMenuContent align="start" className="min-w-40">
          {chatId ? (
            <>
              <DropdownMenuItem onSelect={() => setRenameOpen(true)}>
                <PencilIcon />
                {t("sidebar.editChat")}
              </DropdownMenuItem>
              <DropdownMenuItem onSelect={handleExport}>
                <DownloadIcon />
                {t("sidebar.exportChat")}
              </DropdownMenuItem>
              <DropdownMenuItem onSelect={handleTogglePin}>
                {isPinned ? <PinOffIcon /> : <PinIcon />}
                {isPinned ? t("sidebar.unpinChat") : t("sidebar.pinChat")}
              </DropdownMenuItem>
              {hasWorkspace ? <DropdownMenuSeparator /> : null}
            </>
          ) : null}
          {hasWorkspace ? (
            <DropdownMenuItem onSelect={handleOpenInExplorer}>
              <FolderOpenIcon />
              {t("session.openWorkspaceInExplorer")}
            </DropdownMenuItem>
          ) : null}
        </DropdownMenuContent>
      </DropdownMenu>

      {/* Rename dialog */}
      <Dialog onOpenChange={setRenameOpen} open={renameOpen}>
        <DialogContent className="sm:max-w-md">
          <DialogHeader>
            <DialogTitle>{t("sidebar.editChatTitle")}</DialogTitle>
          </DialogHeader>
          <form
            onSubmit={(e) => {
              e.preventDefault();
              handleRenameSave();
            }}
          >
            <Input
              className="w-full"
              onChange={(e) => setRenameValue(e.target.value)}
              value={renameValue}
            />
            <DialogFooter className="mt-4">
              <button
                className="inline-flex items-center justify-center rounded-2xl border border-input bg-background px-4 py-2 text-sm font-medium hover:bg-accent hover:text-accent-foreground"
                onClick={() => setRenameOpen(false)}
                type="button"
              >
                {t("settings.data.confirmCancel")}
              </button>
              <button
                className="inline-flex items-center justify-center rounded-2xl bg-primary px-4 py-2 text-sm font-medium text-primary-foreground hover:bg-primary/90 disabled:opacity-50"
                disabled={!renameValue.trim()}
                type="submit"
              >
                {t("sidebar.editChatTitleSave")}
              </button>
            </DialogFooter>
          </form>
        </DialogContent>
      </Dialog>

      {/* Export format chooser */}
      <ExportSessionDialog
        sessionId={chatId}
        open={exportOpen}
        onOpenChange={setExportOpen}
      />
    </>
  );
}
