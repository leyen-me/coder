"use client";

import {
  InboxIcon,
  PackagePlusIcon,
  PlayIcon,
  TrashIcon,
} from "lucide-react";
import { useCallback, useState } from "react";

import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import {
  Tooltip,
  TooltipContent,
  TooltipTrigger,
} from "@/components/ui/tooltip";
import { useTranslation } from "@/lib/i18n/locale-provider";

import { useGit } from "../git-provider";
import { EmptyState } from "./empty-state";

export function StashView() {
  const { t } = useTranslation();
  const { stashList, stashPush, stashPop, stashDrop, isLoading } = useGit();
  const [stashMessage, setStashMessage] = useState("");
  const [isStashing, setIsStashing] = useState(false);

  const handleStash = useCallback(async () => {
    setIsStashing(true);
    try {
      await stashPush(stashMessage.trim() || undefined);
      setStashMessage("");
    } catch {
      // Error handled in provider
    } finally {
      setIsStashing(false);
    }
  }, [stashMessage, stashPush]);

  const handlePop = useCallback(
    async (index?: number) => {
      try {
        await stashPop(index);
      } catch {
        // Error handled in provider
      }
    },
    [stashPop],
  );

  const handleDrop = useCallback(
    async (index: number) => {
      try {
        await stashDrop(index);
      } catch {
        // Error handled in provider
      }
    },
    [stashDrop],
  );

  if (isLoading) {
    return (
      <div className="flex h-full items-center justify-center text-sm text-muted-foreground">
        {t("git.loading")}
      </div>
    );
  }

  return (
    <div className="flex min-h-0 flex-1 flex-col">
      {/* Stash input */}
      <div className="flex shrink-0 items-center gap-2 border-b px-3 py-2">
        <Input
          className="h-7 text-xs"
          disabled={isStashing}
          onChange={(e) => setStashMessage(e.target.value)}
          onKeyDown={(e) => {
            if (e.key === "Enter") void handleStash();
          }}
          placeholder={t("git.stashMessagePlaceholder")}
          value={stashMessage}
        />
        <Tooltip>
          <TooltipTrigger asChild>
            <Button
              className="h-7 w-7 shrink-0"
              disabled={isStashing}
              onClick={handleStash}
              size="icon-sm"
              type="button"
              variant="ghost"
            >
              <PackagePlusIcon className="size-3.5" />
            </Button>
          </TooltipTrigger>
          <TooltipContent>{t("git.stash")}</TooltipContent>
        </Tooltip>
      </div>

      {/* Stash list */}
      <div className="flex-1 overflow-y-auto">
        {stashList.length === 0 ? (
          <EmptyState message={t("git.stashNone")} />
        ) : (
          <div className="flex flex-col gap-1 p-2">
            {stashList.map((stash) => (
              <div
                key={stash.index}
                className="flex items-center gap-2 rounded-md border px-3 py-2 transition-colors hover:bg-muted/20"
              >
                <InboxIcon className="size-3.5 shrink-0 text-muted-foreground" />
                <div className="min-w-0 flex-1">
                  <p className="truncate text-xs">{stash.message}</p>
                  <p className="font-mono text-[10px] text-muted-foreground/60">
                    {stash.hash.slice(0, 7)}
                  </p>
                </div>
                <div className="flex shrink-0 items-center gap-0.5">
                  <Tooltip>
                    <TooltipTrigger asChild>
                      <Button
                        className="size-6"
                        onClick={() => void handlePop(stash.index)}
                        size="icon-sm"
                        type="button"
                        variant="ghost"
                      >
                        <PlayIcon className="size-3" />
                      </Button>
                    </TooltipTrigger>
                    <TooltipContent>{t("git.stash")}</TooltipContent>
                  </Tooltip>
                  <Tooltip>
                    <TooltipTrigger asChild>
                      <Button
                        className="size-6"
                        onClick={() => void handleDrop(stash.index)}
                        size="icon-sm"
                        type="button"
                        variant="ghost"
                      >
                        <TrashIcon className="size-3" />
                      </Button>
                    </TooltipTrigger>
                    <TooltipContent>{t("git.deleteBranch")}</TooltipContent>
                  </Tooltip>
                </div>
              </div>
            ))}
          </div>
        )}
      </div>
    </div>
  );
}
