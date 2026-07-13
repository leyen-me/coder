import {
  KeyRound,
  Loader2,
  MoreHorizontalIcon,
  PencilIcon,
  Play,
  Trash2Icon,
} from "lucide-react";

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
import type { McpServerConfig } from "@/lib/db/types";
import { isRemoteMcpServer } from "@/features/mcp/lib/server-config";

type McpServerCardProps = {
  server: McpServerConfig;
  authenticated: boolean;
  onEdit: () => void;
  onDelete: () => void;
  onTest: () => void;
  onAuthorize: () => void;
  onRevokeAuth: () => void;
  onToggleEnabled: () => void;
  isTesting: boolean;
  isAuthorizing: boolean;
};

export function McpServerCard({
  server,
  authenticated,
  onEdit,
  onDelete,
  onTest,
  onAuthorize,
  onRevokeAuth,
  onToggleEnabled,
  isTesting,
  isAuthorizing,
}: McpServerCardProps) {
  const { t } = useTranslation();
  const remote = isRemoteMcpServer(server);
  const preview = remote
    ? server.url
    : [server.command, ...server.args].filter(Boolean).join(" ");

  return (
    <Card
      className={cn(
        "h-full transition-opacity",
        !server.enabled && "opacity-60"
      )}
      size="sm"
    >
      <CardHeader className="gap-2 pb-0">
        <CardTitle className="truncate text-sm font-medium leading-tight">
          {server.name}
        </CardTitle>
        <CardAction>
          <Switch
            checked={server.enabled}
            onCheckedChange={onToggleEnabled}
            aria-label={t("settings.mcpServers.toggleEnabledAria", {
              name: server.name,
            })}
          />
        </CardAction>
        <div className="flex flex-wrap items-center gap-1.5">
          <Badge variant="secondary" className="text-xs">
            {remote
              ? t("settings.mcpServers.transports.http")
              : t("settings.mcpServers.transports.stdio")}
          </Badge>
          {remote ? (
            <Badge
              variant={authenticated ? "default" : "outline"}
              className="text-xs"
            >
              {authenticated
                ? t("settings.mcpServers.authenticated")
                : t("settings.mcpServers.unauthenticated")}
            </Badge>
          ) : null}
        </div>
      </CardHeader>

      <CardContent className="pt-2 pb-0">
        <div className="min-w-0 rounded-md bg-muted/50 px-2.5 py-1.5 font-mono text-xs leading-relaxed text-muted-foreground break-all">
          {preview}
        </div>
      </CardContent>

      <CardFooter className="mt-auto justify-between gap-2 border-t border-border/50 pt-3">
        <div className="flex min-w-0 flex-wrap items-center gap-1">
          <Button
            className="h-8 gap-1.5 px-2.5 text-muted-foreground"
            disabled={isTesting || !server.enabled}
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
            {t("settings.mcpServers.test")}
          </Button>

          {remote ? (
            <Button
              className="h-8 gap-1.5 px-2.5 text-muted-foreground"
              disabled={isAuthorizing || !server.enabled}
              onClick={authenticated ? onRevokeAuth : onAuthorize}
              size="sm"
              type="button"
              variant="ghost"
            >
              {isAuthorizing ? (
                <Loader2 className="size-3.5 animate-spin" />
              ) : (
                <KeyRound className="size-3.5" />
              )}
              {authenticated
                ? t("settings.mcpServers.revokeAuth")
                : t("settings.mcpServers.authorize")}
            </Button>
          ) : null}
        </div>

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
              {t("settings.mcpServers.edit")}
            </DropdownMenuItem>
            <DropdownMenuItem onSelect={onDelete} variant="destructive">
              <Trash2Icon />
              {t("settings.mcpServers.delete")}
            </DropdownMenuItem>
          </DropdownMenuContent>
        </DropdownMenu>
      </CardFooter>
    </Card>
  );
}
