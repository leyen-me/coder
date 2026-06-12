"use client";

import { ArrowDownFromLineIcon, ArrowUpFromLineIcon, CloudDownloadIcon } from "lucide-react";
import { useCallback, useState } from "react";

import { Button } from "@/components/ui/button";
import {
  Tooltip,
  TooltipContent,
  TooltipTrigger,
} from "@/components/ui/tooltip";
import { useTranslation } from "@/lib/i18n/locale-provider";

import { useGit } from "../git-provider";

export function RemoteActions() {
  const { t } = useTranslation();
  const { push, pull, fetch: gitFetch, remoteUrl } = useGit();
  const [isPushing, setIsPushing] = useState(false);
  const [isPulling, setIsPulling] = useState(false);
  const [isFetching, setIsFetching] = useState(false);

  const handlePush = useCallback(async () => {
    setIsPushing(true);
    try {
      await push();
    } catch {
      // Error handled in provider
    } finally {
      setIsPushing(false);
    }
  }, [push]);

  const handlePull = useCallback(async () => {
    setIsPulling(true);
    try {
      await pull();
    } catch {
      // Error handled in provider
    } finally {
      setIsPulling(false);
    }
  }, [pull]);

  const handleFetch = useCallback(async () => {
    setIsFetching(true);
    try {
      await gitFetch();
    } catch {
      // Error handled in provider
    } finally {
      setIsFetching(false);
    }
  }, [gitFetch]);

  if (!remoteUrl) return null;

  return (
    <div className="flex items-center gap-0.5">
      <Tooltip>
        <TooltipTrigger asChild>
          <Button
            aria-label={t("git.push")}
            className="h-6 w-6"
            disabled={isPushing}
            onClick={handlePush}
            size="icon-sm"
            type="button"
            variant="ghost"
          >
            <ArrowUpFromLineIcon className="size-3" />
          </Button>
        </TooltipTrigger>
        <TooltipContent>{t("git.push")}</TooltipContent>
      </Tooltip>

      <Tooltip>
        <TooltipTrigger asChild>
          <Button
            aria-label={t("git.pull")}
            className="h-6 w-6"
            disabled={isPulling}
            onClick={handlePull}
            size="icon-sm"
            type="button"
            variant="ghost"
          >
            <ArrowDownFromLineIcon className="size-3" />
          </Button>
        </TooltipTrigger>
        <TooltipContent>{t("git.pull")}</TooltipContent>
      </Tooltip>

      <Tooltip>
        <TooltipTrigger asChild>
          <Button
            aria-label={t("git.fetch")}
            className="h-6 w-6"
            disabled={isFetching}
            onClick={handleFetch}
            size="icon-sm"
            type="button"
            variant="ghost"
          >
            <CloudDownloadIcon className="size-3" />
          </Button>
        </TooltipTrigger>
        <TooltipContent>{t("git.fetch")}</TooltipContent>
      </Tooltip>
    </div>
  );
}
