import { FolderOpenIcon, MoreHorizontalIcon, Trash2Icon } from "lucide-react";

import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import {
  Card,
  CardAction,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { useTranslation } from "@/lib/i18n/locale-provider";
import { cn } from "@/lib/utils";

import type { UserSkillCardViewModel } from "../types";

type SkillCardProps = {
  skill: UserSkillCardViewModel;
  onView?: () => void;
  onOpenFolder?: () => void;
  onDelete?: () => void;
};

export function SkillCard({
  skill,
  onView,
  onOpenFolder,
  onDelete,
}: SkillCardProps) {
  const { t } = useTranslation();
  const hasMenu = Boolean(onOpenFolder || onDelete);

  return (
    <Card
      className="h-full gap-2.5 transition-[box-shadow,transform] duration-200 hover:-translate-y-px hover:shadow-lg"
      size="sm"
    >
      <CardHeader
        className={cn(
          "gap-2 pb-0 outline-none focus-visible:ring-3 focus-visible:ring-ring/30",
          onView && "cursor-pointer"
        )}
        onClick={onView}
        onKeyDown={
          onView
            ? (event) => {
                if (event.key === "Enter" || event.key === " ") {
                  event.preventDefault();
                  onView();
                }
              }
            : undefined
        }
        role={onView ? "button" : undefined}
        tabIndex={onView ? 0 : undefined}
      >
        <div className="flex min-w-0 items-center gap-2 overflow-hidden pr-1">
          <CardTitle className="truncate text-sm font-semibold leading-tight">
            {skill.name}
          </CardTitle>
          <Badge className="shrink-0 text-[10px]" variant="secondary">
            {skill.source === "workspace"
              ? t("skills.badgeWorkspace")
              : t("skills.badgeUser")}
          </Badge>
        </div>

        <CardDescription className="line-clamp-3 text-xs leading-relaxed">
          {skill.description}
        </CardDescription>

        {hasMenu ? (
          <CardAction onClick={(event) => event.stopPropagation()}>
            <DropdownMenu>
              <DropdownMenuTrigger asChild>
                <Button
                  aria-label={t("skills.cardActions")}
                  className="text-muted-foreground"
                  size="icon-xs"
                  type="button"
                  variant="ghost"
                >
                  <MoreHorizontalIcon className="size-3.5" />
                </Button>
              </DropdownMenuTrigger>
              <DropdownMenuContent align="end" className="min-w-40">
                {onOpenFolder ? (
                  <DropdownMenuItem onSelect={onOpenFolder}>
                    <FolderOpenIcon />
                    {t("skills.openFolder")}
                  </DropdownMenuItem>
                ) : null}
                {onDelete ? (
                  <DropdownMenuItem onSelect={onDelete} variant="destructive">
                    <Trash2Icon />
                    {t("skills.delete")}
                  </DropdownMenuItem>
                ) : null}
              </DropdownMenuContent>
            </DropdownMenu>
          </CardAction>
        ) : null}
      </CardHeader>

      <CardContent className="pt-0">
        <p className="text-[11px] tabular-nums text-muted-foreground">
          {t("skills.estimatedTokens", { count: skill.estimatedTokens })}
        </p>
      </CardContent>
    </Card>
  );
}
