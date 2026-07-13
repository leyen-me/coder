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
import type { McpServerConfig } from "@/lib/db/types";

type McpServerCardProps = {
  server: McpServerConfig;
  onEdit: () => void;
  onDelete: () => void;
  onTest: () => void;
  onToggleEnabled: () => void;
  isTesting: boolean;
};

export function McpServerCard({
  server,
  onEdit,
  onDelete,
  onTest,
  onToggleEnabled,
  isTesting,
}: McpServerCardProps) {
  const { t } = useTranslation();
  const commandPreview = [server.command, ...server.args].join(" ");

  return (
    <Card
      className={cn(
        "relative h-full transition-opacity",
        !server.enabled && "opacity-60"
      )}
      size="sm"
    >
      <CardHeader className="pb-2">
        <div className="flex min-w-0 items-center gap-2 overflow-hidden">
          <CardTitle className="truncate text-sm font-medium leading-tight">
            {server.name}
          </CardTitle>
          <Badge variant="secondary" className="shrink-0 text-xs">
            {server.id}
          </Badge>
        </div>
        <CardAction>
          <Switch
            checked={server.enabled}
            onCheckedChange={onToggleEnabled}
            aria-label={t("settings.mcpServers.toggleEnabledAria", {
              name: server.name,
            })}
          />
        </CardAction>
      </CardHeader>

      <CardContent className="pb-3">
        <div className="min-w-0 rounded-md bg-muted/50 px-2.5 py-1.5 font-mono text-xs text-muted-foreground">
          {commandPreview}
        </div>
      </CardContent>

      <CardFooter className="justify-between">
        <Button
          className="h-8 px-2 text-muted-foreground"
          disabled={isTesting || !server.enabled}
          onClick={onTest}
          type="button"
          variant="ghost"
        >
          {isTesting ? (
            <Loader2 className="size-3.5 animate-spin" />
          ) : (
            <Play className="size-3.5" />
          )}
          {t("settings.mcpServers.test")}
        </Button>

        <Button
          className="h-8 px-2 text-muted-foreground"
          onClick={onEdit}
          type="button"
          variant="ghost"
        >
          <PencilIcon className="size-3.5" />
          {t("settings.mcpServers.edit")}
        </Button>

        <Button
          className="h-8 px-2 text-muted-foreground hover:text-destructive"
          onClick={onDelete}
          type="button"
          variant="ghost"
        >
          <Trash2Icon className="size-3.5" />
          {t("settings.mcpServers.delete")}
        </Button>
      </CardFooter>
    </Card>
  );
}
