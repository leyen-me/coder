import { Loader2, MoreHorizontalIcon, PencilIcon, Play, Trash2Icon } from "lucide-react";

import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import {
  Card,
  CardAction,
  CardContent,
  CardFooter,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { Switch } from "@/components/ui/switch";
import { useTranslation } from "@/lib/i18n/locale-provider";
import { cn } from "@/lib/utils";

import type { RemoteTargetAuth, RemoteTargetConfig } from "@/lib/db/types";

type AuthType = RemoteTargetAuth["type"];

function authTypeLabel(t: (key: string) => string, type: AuthType): string {
  switch (type) {
    case "agent":
      return t("settings.remoteTargets.authTypes.agent");
    case "key":
      return t("settings.remoteTargets.authTypes.key");
    case "keyContent":
      return t("settings.remoteTargets.authTypes.keyContent");
    case "password":
      return t("settings.remoteTargets.authTypes.password");
  }
}

type RemoteTargetCardProps = {
  target: RemoteTargetConfig;
  onEdit: () => void;
  onDelete: () => void;
  onTest: () => void;
  onToggleEnabled: () => void;
  isTesting: boolean;
};

export function RemoteTargetCard({
  target,
  onEdit,
  onDelete,
  onTest,
  onToggleEnabled,
  isTesting,
}: RemoteTargetCardProps) {
  const { t } = useTranslation();

  return (
    <Card
      className={cn(
        "h-full transition-opacity",
        !target.enabled && "opacity-60",
      )}
      size="sm"
    >
      <CardHeader className="gap-2 pb-0">
        <CardTitle className="truncate text-sm font-medium leading-tight">
          {target.alias}
        </CardTitle>
        <CardAction>
          <Switch
            checked={target.enabled}
            onCheckedChange={onToggleEnabled}
            aria-label={t("settings.remoteTargets.toggleEnabledAria", {
              alias: target.alias,
            })}
          />
        </CardAction>
        <Badge variant="secondary" className="w-fit text-xs">
          {authTypeLabel(t as (key: string) => string, target.auth.type)}
        </Badge>
      </CardHeader>

      <CardContent className="pt-2 pb-0">
        <div className="min-w-0 rounded-md bg-muted/50 px-2.5 py-1.5 font-mono text-xs leading-relaxed text-muted-foreground break-all">
          {target.user}@{target.host}:{target.port}
        </div>
      </CardContent>

      <CardFooter className="mt-auto justify-between gap-2 border-t border-border/50 pt-3">
        <Button
          className="h-8 gap-1.5 px-2.5 text-muted-foreground"
          disabled={isTesting || !target.enabled}
          onClick={onTest}
          size="sm"
          type="button"
          variant="ghost"
        >
          {isTesting ? (
            <Loader2 className="size-3.5 animate-spin" />
          ) : (
            <Play className="size-3.5" />
          )}
          {t("settings.remoteTargets.test")}
        </Button>

        <DropdownMenu>
          <DropdownMenuTrigger asChild>
            <Button
              aria-label={t("settings.mcpServers.moreActionsAria")}
              className="shrink-0 text-muted-foreground"
              size="icon-sm"
              type="button"
              variant="ghost"
            >
              <MoreHorizontalIcon className="size-4" />
            </Button>
          </DropdownMenuTrigger>
          <DropdownMenuContent align="end" className="min-w-36">
            <DropdownMenuItem onSelect={onEdit}>
              <PencilIcon />
              {t("settings.remoteTargets.edit")}
            </DropdownMenuItem>
            <DropdownMenuItem onSelect={onDelete} variant="destructive">
              <Trash2Icon />
              {t("settings.remoteTargets.delete")}
            </DropdownMenuItem>
          </DropdownMenuContent>
        </DropdownMenu>
      </CardFooter>
    </Card>
  );
}
