import { Loader2, Play, PencilIcon, Trash2Icon } from "lucide-react";

import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardFooter } from "@/components/ui/card";
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
    <Card className="relative h-full" size="sm">
      <CardContent className="flex h-full flex-col gap-3 pt-(--card-spacing)">
        <div className="flex items-start justify-between gap-2">
          <div className="min-w-0 flex-1">
            <h3 className="truncate text-sm font-medium leading-tight">
              {target.alias}
            </h3>
          </div>
          <Badge variant="secondary" className="shrink-0 text-xs">
            {authTypeLabel(t as (key: string) => string, target.auth.type)}
          </Badge>
        </div>

        <div
          className={cn(
            "min-w-0 rounded-md bg-muted/50 px-2.5 py-1.5 font-mono text-xs text-muted-foreground",
            !target.enabled && "opacity-50"
          )}
        >
          {target.user}@{target.host}:{target.port}
        </div>
      </CardContent>

      <CardFooter className="items-center gap-2 border-t pt-(--card-spacing)">
        <Switch
          size="sm"
          checked={target.enabled}
          onCheckedChange={onToggleEnabled}
          aria-label={t("settings.remoteTargets.toggleEnabledAria", {
            alias: target.alias,
          })}
        />

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
          {t("settings.remoteTargets.testConnection")}
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
