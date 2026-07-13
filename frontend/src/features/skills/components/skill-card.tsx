import { EyeIcon, FolderOpenIcon, MoreHorizontalIcon, Trash2Icon } from "lucide-react";

import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import {
  Card,
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
import { useTranslation } from "@/lib/i18n/locale-provider";

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
    <Card className="h-full" size="sm">
      <CardHeader className="gap-2 pb-0">
        <div className="flex min-w-0 items-center gap-2 overflow-hidden pr-1">
          <CardTitle className="truncate text-sm font-medium leading-tight">
            {skill.name}
          </CardTitle>
          <Badge className="shrink-0 text-[10px]" variant="secondary">
            {skill.source === "workspace"
              ? t("skills.badgeWorkspace")
              : t("skills.badgeUser")}
          </Badge>
        </div>
      </CardHeader>

      <CardContent className="pt-3 pb-0">
        <p className="line-clamp-3 text-xs leading-relaxed text-muted-foreground">
          {skill.description}
        </p>
        <p className="mt-1.5 text-[11px] tabular-nums text-muted-foreground/60">
          {t("skills.estimatedTokens", { count: skill.estimatedTokens })}
        </p>
      </CardContent>

      <CardFooter className="mt-auto justify-between gap-2 border-t border-border/50 pt-3">
        {onView ? (
          <Button
            className="h-8 gap-1.5 px-2.5 text-muted-foreground"
            onClick={onView}
            size="sm"
            type="button"
            variant="ghost"
          >
            <EyeIcon className="size-3.5" />
            {t("skills.viewDetails")}
          </Button>
        ) : (
          <div />
        )}

        {hasMenu ? (
          <DropdownMenu>
            <DropdownMenuTrigger asChild>
              <Button
                aria-label={t("skills.cardActions")}
                className="shrink-0 text-muted-foreground"
                size="icon-sm"
                type="button"
                variant="ghost"
              >
                <MoreHorizontalIcon className="size-4" />
              </Button>
            </DropdownMenuTrigger>
            <DropdownMenuContent align="end" className="min-w-36">
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
        ) : null}
      </CardFooter>
    </Card>
  );
}
