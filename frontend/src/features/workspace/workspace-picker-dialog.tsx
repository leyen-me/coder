import { ChevronRightIcon, FolderIcon, Loader2Icon } from "lucide-react";
import { Fragment, useState } from "react";

import {
  Breadcrumb,
  BreadcrumbItem,
  BreadcrumbLink,
  BreadcrumbList,
  BreadcrumbPage,
  BreadcrumbSeparator,
} from "@/components/ui/breadcrumb";
import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { ScrollArea } from "@/components/ui/scroll-area";
import { useTranslation } from "@/lib/i18n/locale-provider";

import { splitWorkspacePickerPath } from "./split-workspace-picker-path";
import { useWorkspaceDirectoryBrowser } from "./use-workspace-directory-browser";
import { validateWorkspaceDir } from "./validate-workspace-dir";

type WorkspacePickerDialogProps = {
  open: boolean;
  defaultPath: string;
  onConfirm: (path: string) => void;
  onCancel: () => void;
};

export function WorkspacePickerDialog({
  open,
  defaultPath,
  onConfirm,
  onCancel,
}: WorkspacePickerDialogProps) {
  const { t } = useTranslation();
  const {
    currentPath,
    entries,
    loading,
    error,
    navigateTo,
    goUp,
    isAtRootListing,
  } = useWorkspaceDirectoryBrowser(open, defaultPath);
  const [confirmError, setConfirmError] = useState<string | null>(null);
  const [isConfirming, setIsConfirming] = useState(false);

  const breadcrumbSegments = splitWorkspacePickerPath(currentPath);

  const handleConfirm = async () => {
    if (!currentPath || isConfirming) {
      return;
    }

    setIsConfirming(true);
    setConfirmError(null);

    const result = await validateWorkspaceDir(currentPath);
    setIsConfirming(false);

    if (!result.ok) {
      setConfirmError(result.message);
      return;
    }

    onConfirm(result.path);
  };

  return (
    <Dialog
      open={open}
      onOpenChange={(nextOpen) => {
        if (!nextOpen) {
          onCancel();
        }
      }}
    >
      <DialogContent className="gap-4 sm:max-w-xl">
        <DialogHeader>
          <DialogTitle>{t("chat.pickWorkspaceTitle")}</DialogTitle>
          <DialogDescription>{t("chat.pickWorkspaceDescription")}</DialogDescription>
        </DialogHeader>

        <div className="space-y-3">
          <div className="flex items-center gap-2">
            <Button
              type="button"
              variant="outline"
              size="sm"
              disabled={loading || isAtRootListing}
              onClick={goUp}
            >
              {t("chat.pickWorkspaceGoUp")}
            </Button>

            <Breadcrumb className="min-w-0 flex-1">
              <BreadcrumbList className="flex-nowrap overflow-hidden">
                {isAtRootListing ? (
                  <BreadcrumbItem>
                    <BreadcrumbPage>{t("chat.pickWorkspaceLocations")}</BreadcrumbPage>
                  </BreadcrumbItem>
                ) : (
                  breadcrumbSegments.map((segment, index) => {
                    const isLast = index === breadcrumbSegments.length - 1;

                    return (
                      <Fragment key={segment.path}>
                        <BreadcrumbItem className="min-w-0">
                          {isLast ? (
                            <BreadcrumbPage className="truncate">{segment.label}</BreadcrumbPage>
                          ) : (
                            <BreadcrumbLink
                              className="cursor-pointer truncate"
                              onClick={() => {
                                void navigateTo(segment.path);
                              }}
                            >
                              {segment.label}
                            </BreadcrumbLink>
                          )}
                        </BreadcrumbItem>
                        {!isLast ? (
                          <BreadcrumbSeparator>
                            <ChevronRightIcon />
                          </BreadcrumbSeparator>
                        ) : null}
                      </Fragment>
                    );
                  })
                )}
              </BreadcrumbList>
            </Breadcrumb>
          </div>

          <div className="rounded-xl border border-border/70">
            <ScrollArea className="h-72">
              <div className="p-1">
                {loading ? (
                  <div className="flex h-64 items-center justify-center gap-2 text-sm text-muted-foreground">
                    <Loader2Icon className="size-4 animate-spin" />
                    {t("chat.pickWorkspaceLoading")}
                  </div>
                ) : error ? (
                  <div className="flex h-64 items-center justify-center px-4 text-center text-sm text-destructive">
                    {error}
                  </div>
                ) : entries.length === 0 ? (
                  <div className="flex h-64 items-center justify-center px-4 text-center text-sm text-muted-foreground">
                    {t("chat.pickWorkspaceEmpty")}
                  </div>
                ) : (
                  entries.map((entry) => (
                    <button
                      key={entry.path}
                      type="button"
                      className="flex w-full items-center gap-2 rounded-lg px-3 py-2 text-left text-sm transition-colors hover:bg-muted/70"
                      onClick={() => {
                        void navigateTo(entry.path);
                      }}
                    >
                      <FolderIcon className="size-4 shrink-0 text-muted-foreground" />
                      <span className="truncate">{entry.name}</span>
                    </button>
                  ))
                )}
              </div>
            </ScrollArea>
          </div>

          {!isAtRootListing ? (
            <p className="truncate text-sm text-muted-foreground">
              {t("chat.pickWorkspaceCurrentSelection", { path: currentPath })}
            </p>
          ) : null}

          {confirmError ? (
            <p className="text-sm text-destructive" role="alert">
              {confirmError}
            </p>
          ) : null}
        </div>

        <DialogFooter>
          <Button type="button" variant="ghost" disabled={isConfirming} onClick={onCancel}>
            {t("chat.pickWorkspaceCancel")}
          </Button>
          <Button
            type="button"
            disabled={!currentPath || loading || isConfirming}
            onClick={() => {
              void handleConfirm();
            }}
          >
            {isConfirming
              ? t("chat.pickWorkspaceValidating")
              : t("chat.pickWorkspaceSelectFolder")}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
