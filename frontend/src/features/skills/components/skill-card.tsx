import { EyeIcon, FolderOpenIcon, Trash2Icon } from "lucide-react";

import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardFooter } from "@/components/ui/card";
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
  const handleContentActivate = onView;
  const isContentClickable = Boolean(onView);

  return (
    <Card size="sm">
      <CardContent
        className={`space-y-2 ${isContentClickable ? "cursor-pointer" : ""}`}
        onClick={handleContentActivate}
        onKeyDown={
          handleContentActivate
            ? (event) => {
                if (event.key === "Enter" || event.key === " ") {
                  event.preventDefault();
                  handleContentActivate();
                }
              }
            : undefined
        }
        role={isContentClickable ? "button" : undefined}
        tabIndex={isContentClickable ? 0 : undefined}
      >
        <div className="flex flex-wrap items-center gap-2">
          <h3 className="text-sm font-medium leading-tight">{skill.name}</h3>
          <Badge variant="secondary">
            {skill.source === "workspace"
              ? t("skills.badgeWorkspace")
              : t("skills.badgeUser")}
          </Badge>
        </div>

        <p className="line-clamp-2 text-sm text-muted-foreground">
          {skill.description}
        </p>

        <p className="font-mono text-xs text-muted-foreground">{`/${skill.slug}`}</p>
        <p className="truncate font-mono text-[11px] text-muted-foreground">
          {skill.directoryPath}
        </p>
      </CardContent>

      {onView || onOpenFolder || onDelete ? (
        <CardFooter className="gap-2 border-t pt-(--card-spacing)">
          <Button
            className="h-8 px-2 text-muted-foreground"
            onClick={onView}
            type="button"
            variant="ghost"
            disabled={!onView}
          >
            <EyeIcon className="size-3.5" />
            {t("skills.viewDetails")}
          </Button>
          {onOpenFolder ? (
            <Button
              className="h-8 px-2 text-muted-foreground"
              onClick={onOpenFolder}
              type="button"
              variant="ghost"
            >
              <FolderOpenIcon className="size-3.5" />
              {t("skills.openFolder")}
            </Button>
          ) : null}
          {onDelete ? (
            <Button
              className="h-8 px-2 text-muted-foreground hover:text-destructive"
              onClick={onDelete}
              type="button"
              variant="ghost"
            >
              <Trash2Icon className="size-3.5" />
              {t("skills.delete")}
            </Button>
          ) : null}
        </CardFooter>
      ) : null}
    </Card>
  );
}
