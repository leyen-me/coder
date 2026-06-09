"use client";

import { useCallback, useState } from "react";

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
import { useTranslation } from "@/lib/i18n/locale-provider";

export type FileTreeNameDialogMode = "new-file" | "new-folder" | "rename";

type FileTreeNameDialogProps = {
  mode: FileTreeNameDialogMode | null;
  defaultName?: string;
  onOpenChange: (open: boolean) => void;
  onSubmit: (name: string) => Promise<void>;
};

type FileTreeDeleteDialogProps = {
  targetName: string | null;
  isDir: boolean;
  onOpenChange: (open: boolean) => void;
  onConfirm: () => Promise<void>;
};

function nameDialogTitleKey(mode: FileTreeNameDialogMode) {
  if (mode === "new-file") {
    return "rightPanel.dialogNewFileTitle";
  }
  if (mode === "new-folder") {
    return "rightPanel.dialogNewFolderTitle";
  }
  return "rightPanel.dialogRenameTitle";
}

function nameDialogDescriptionKey(mode: FileTreeNameDialogMode) {
  if (mode === "new-file") {
    return "rightPanel.dialogNewFileDescription";
  }
  if (mode === "new-folder") {
    return "rightPanel.dialogNewFolderDescription";
  }
  return "rightPanel.dialogRenameDescription";
}

export function FileTreeNameDialog({
  mode,
  defaultName = "",
  onOpenChange,
  onSubmit,
}: FileTreeNameDialogProps) {
  const { t } = useTranslation();
  const [name, setName] = useState(defaultName);
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const open = mode !== null;

  const handleOpenChange = useCallback(
    (nextOpen: boolean) => {
      if (!nextOpen) {
        setError(null);
        setSubmitting(false);
      }
      onOpenChange(nextOpen);
    },
    [onOpenChange]
  );

  const handleSubmit = useCallback(async () => {
    const trimmed = name.trim();
    if (trimmed.length === 0) {
      setError(t("rightPanel.errorNameRequired"));
      return;
    }

    setSubmitting(true);
    setError(null);
    try {
      await onSubmit(trimmed);
      handleOpenChange(false);
    } catch (submitError) {
      const message =
        submitError instanceof Error
          ? submitError.message
          : String(submitError);
      setError(message);
    } finally {
      setSubmitting(false);
    }
  }, [handleOpenChange, name, onSubmit, t]);

  return (
    <Dialog
      onOpenChange={(nextOpen) => {
        if (nextOpen) {
          setName(defaultName);
          setError(null);
        }
        handleOpenChange(nextOpen);
      }}
      open={open}
    >
      <DialogContent showCloseButton={!submitting}>
        {mode ? (
          <>
            <DialogHeader>
              <DialogTitle>{t(nameDialogTitleKey(mode))}</DialogTitle>
              <DialogDescription>
                {t(nameDialogDescriptionKey(mode))}
              </DialogDescription>
            </DialogHeader>

            <Input
              autoFocus
              disabled={submitting}
              onChange={(event) => setName(event.target.value)}
              onKeyDown={(event) => {
                if (event.key === "Enter") {
                  event.preventDefault();
                  void handleSubmit();
                }
              }}
              placeholder={t("rightPanel.dialogNamePlaceholder")}
              value={name}
            />

            {error ? (
              <p className="text-sm text-destructive">{error}</p>
            ) : null}

            <DialogFooter>
              <Button
                disabled={submitting}
                onClick={() => handleOpenChange(false)}
                type="button"
                variant="outline"
              >
                {t("rightPanel.dialogCancel")}
              </Button>
              <Button
                disabled={submitting}
                onClick={() => {
                  void handleSubmit();
                }}
                type="button"
              >
                {t("rightPanel.dialogConfirm")}
              </Button>
            </DialogFooter>
          </>
        ) : null}
      </DialogContent>
    </Dialog>
  );
}

export function FileTreeDeleteDialog({
  targetName,
  isDir,
  onOpenChange,
  onConfirm,
}: FileTreeDeleteDialogProps) {
  const { t } = useTranslation();
  const [submitting, setSubmitting] = useState(false);
  const open = targetName !== null;

  const handleConfirm = useCallback(async () => {
    setSubmitting(true);
    try {
      await onConfirm();
      onOpenChange(false);
    } catch {
      // Errors surface via toast in the caller.
    } finally {
      setSubmitting(false);
    }
  }, [onConfirm, onOpenChange]);

  return (
    <AlertDialog onOpenChange={onOpenChange} open={open}>
      <AlertDialogContent>
        <AlertDialogHeader>
          <AlertDialogTitle>{t("rightPanel.dialogDeleteTitle")}</AlertDialogTitle>
          <AlertDialogDescription>
            {isDir
              ? t("rightPanel.dialogDeleteFolderDescription", {
                  name: targetName ?? "",
                })
              : t("rightPanel.dialogDeleteFileDescription", {
                  name: targetName ?? "",
                })}
          </AlertDialogDescription>
        </AlertDialogHeader>
        <AlertDialogFooter>
          <AlertDialogCancel disabled={submitting}>
            {t("rightPanel.dialogCancel")}
          </AlertDialogCancel>
          <AlertDialogAction
            disabled={submitting}
            onClick={(event) => {
              event.preventDefault();
              void handleConfirm();
            }}
            variant="destructive"
          >
            {t("rightPanel.menuDelete")}
          </AlertDialogAction>
        </AlertDialogFooter>
      </AlertDialogContent>
    </AlertDialog>
  );
}
