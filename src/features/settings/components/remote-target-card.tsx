import { Loader2, Play, PencilIcon, Trash2Icon } from "lucide-react";

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
        "relative h-full transition-opacity",
        !target.enabled && "opacity-60"
      )}
      size="sm"
    >
      <CardHeader className="pb-2">
        <div className="flex min-w-0 items-center gap-2 overflow-hidden">
          <CardTitle className="truncate text-sm font-medium leading-tight">
            {target.alias}
          </CardTitle>
          <Badge variant="secondary" className="shrink-0 text-xs">
            {authTypeLabel(t as (key: string) => string, target.auth.type)}
          </Badge>
        </div>
        <CardAction>
          <Switch
            checked={target.enabled}
            onCheckedChange={onToggleEnabled}
            aria-label={t("settings.remoteTargets.toggleEnabledAria", {
              alias: target.alias,
            })}
          />
        </CardAction>
      </CardHeader>

      <CardContent className="pb-3">
        <div className="min-w-0 rounded-md bg-muted/50 px-2.5 py-1.5 font-mono text-xs text-muted-foreground">
          {target.user}@{target.host}:{target.port}
        </div>
      </CardContent>

      <CardFooter className="justify-between">
        <Button
          className="h-8 px-2 text-muted-foreground"
          disabled={isTesting || !target.enabled}
          onClick={onTest}
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

        <Button
          className="h-8 px-2 text-muted-foreground"
          onClick={onEdit}
          type="button"
          variant="ghost"
        >
          <PencilIcon className="size-3.5" />
          {t("settings.remoteTargets.edit")}
        </Button>

        <Button
          className="h-8 px-2 text-muted-foreground hover:text-destructive"
          onClick={onDelete}
          type="button"
          variant="ghost"
        >
          <Trash2Icon className="size-3.5" />
          {t("settings.remoteTargets.delete")}
        </Button>
      </CardFooter>
    </Card>
  );
}
