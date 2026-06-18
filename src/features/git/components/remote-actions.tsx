"use client";

import { ArrowDownFromLineIcon, ArrowUpFromLineIcon, Loader2Icon } from "lucide-react";
import { useCallback, useState } from "react";
import { toast } from "sonner";

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
import {
  Tooltip,
  TooltipContent,
  TooltipTrigger,
} from "@/components/ui/tooltip";
import { useTranslation } from "@/lib/i18n/locale-provider";
import { cn } from "@/lib/utils";

import { useGit } from "../git-provider";

type PullDialogMode = "confirm" | "blocked" | null;

export function RemoteActions() {
  const { t } = useTranslation();
  const { push, pull, remoteUrl, statusEntries, currentBranch, aheadCount, behindCount } =
    useGit();
  const [isPushing, setIsPushing] = useState(false);
  const [isPulling, setIsPulling] = useState(false);
  const [pullDialogMode, setPullDialogMode] = useState<PullDialogMode>(null);

  const handlePush = useCallback(async () => {
    setIsPushing(true);
    try {
      await push();
      toast.success(t("git.pushSuccess"));
    } catch {
      toast.error(t("git.pushFailed"));
    } finally {
      setIsPushing(false);
    }
  }, [push, t]);

  const executePull = useCallback(async () => {
    setIsPulling(true);
    try {
      await pull();
      toast.success(t("git.pullSuccess"));
    } catch {
      toast.error(t("git.pullFailed"));
    } finally {
      setIsPulling(false);
    }
  }, [pull, t]);

  const handlePull = useCallback(() => {
    if (statusEntries.length > 0) {
      setPullDialogMode("blocked");
      return;
    }

    setPullDialogMode("confirm");
  }, [statusEntries.length]);

  if (!remoteUrl) return null;

  return (
    <>
      <div className="flex items-center gap-0.5">
        <Tooltip>
          <TooltipTrigger asChild>
            <button
              aria-label={t("git.push")}
              className="rounded-md p-1 text-muted-foreground transition-colors hover:bg-muted/30 hover:text-foreground disabled:pointer-events-none disabled:opacity-50"
              disabled={isPushing || aheadCount === 0}
              onClick={handlePush}
              type="button"
            >
              {isPushing ? (
                <Loader2Icon className="size-3 animate-spin" />
              ) : (
                <ArrowUpFromLineIcon
                  className={cn(
                    "size-3",
                    aheadCount === 0 && "text-muted-foreground/40",
                  )}
                />
              )}
            </button>
          </TooltipTrigger>
          <TooltipContent>{t("git.push")}</TooltipContent>
        </Tooltip>

        <Tooltip>
          <TooltipTrigger asChild>
            <button
              aria-label={t("git.pull")}
              className="rounded-md p-1 text-muted-foreground transition-colors hover:bg-muted/30 hover:text-foreground disabled:pointer-events-none disabled:opacity-50"
              disabled={isPulling || behindCount === 0}
              onClick={handlePull}
              type="button"
            >
              {isPulling ? (
                <Loader2Icon className="size-3 animate-spin" />
              ) : (
                <ArrowDownFromLineIcon
                  className={cn(
                    "size-3",
                    behindCount === 0 && "text-muted-foreground/40",
                  )}
                />
              )}
            </button>
          </TooltipTrigger>
          <TooltipContent>{t("git.pull")}</TooltipContent>
        </Tooltip>
      </div>

      <AlertDialog open={pullDialogMode !== null} onOpenChange={(open) => !open && setPullDialogMode(null)}>
        <AlertDialogContent size="sm">
          <AlertDialogHeader>
            <AlertDialogTitle>
              {pullDialogMode === "blocked" ? t("git.pullBlockedTitle") : t("git.pullConfirmTitle")}
            </AlertDialogTitle>
            <AlertDialogDescription>
              {pullDialogMode === "blocked"
                ? t("git.pullBlockedDescription")
                : t("git.pullConfirmDescription", { branch: currentBranch ?? "HEAD" })}
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel disabled={isPulling}>{t("git.cancel")}</AlertDialogCancel>
            {pullDialogMode === "confirm" ? (
              <AlertDialogAction
                disabled={isPulling}
                onClick={() => {
                  setPullDialogMode(null);
                  void executePull();
                }}
              >
                {isPulling ? t("git.operationInProgress") : t("git.continuePull")}
              </AlertDialogAction>
            ) : null}
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </>
  );
}
