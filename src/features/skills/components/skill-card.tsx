import { EyeIcon, PencilIcon, Trash2Icon } from "lucide-react";

import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardFooter } from "@/components/ui/card";
import { useTranslation } from "@/lib/i18n/locale-provider";
import { cn } from "@/lib/utils";

import type { SkillCardViewModel } from "../types";
import { SkillEnableToggle } from "./skill-enable-toggle";

type SkillCardProps = {
  skill: SkillCardViewModel;
  onToggleEnabled: (enabled: boolean) => void;
  onView?: () => void;
  onEdit?: () => void;
  onDelete?: () => void;
};

export function SkillCard({
  skill,
  onToggleEnabled,
  onView,
  onEdit,
  onDelete,
}: SkillCardProps) {
  const { t } = useTranslation();
  const isUser = skill.source === "user";
  const handleContentActivate = onView ?? (isUser && onEdit ? onEdit : undefined);
  const isContentClickable = Boolean(handleContentActivate);

  return (
    <Card
      className={cn("relative", !skill.enabled && "opacity-70")}
      size="sm"
    >
      <div className="absolute top-(--card-spacing) right-(--card-spacing)">
        <SkillEnableToggle
          enabled={skill.enabled}
          label={
            skill.enabled
              ? t("skills.disableSkill", { name: skill.name })
              : t("skills.enableSkill", { name: skill.name })
          }
          onToggle={onToggleEnabled}
        />
      </div>

      <CardContent
        className={cn("space-y-2 pr-10", isContentClickable && "cursor-pointer")}
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
            {isUser ? t("skills.badgeUser") : t("skills.badgeSystem")}
          </Badge>
        </div>

        <p className="line-clamp-2 text-sm text-muted-foreground">
          {skill.description}
        </p>

        <p className="font-mono text-xs text-muted-foreground">
          {isUser ? `/${skill.slug}` : t("skills.estimatedTokens", { count: skill.estimatedTokens })}
        </p>
      </CardContent>

      {onView ? (
        <CardFooter className="gap-2 border-t pt-(--card-spacing)">
          <Button
            className="h-8 px-2 text-muted-foreground"
            onClick={onView}
            type="button"
            variant="ghost"
          >
            <EyeIcon className="size-3.5" />
            {t("skills.viewDetails")}
          </Button>
        </CardFooter>
      ) : null}

      {isUser && (onEdit || onDelete) ? (
        <CardFooter className="gap-2 border-t pt-(--card-spacing)">
          {onEdit ? (
            <Button
              className="h-8 px-2 text-muted-foreground"
              onClick={onEdit}
              type="button"
              variant="ghost"
            >
              <PencilIcon className="size-3.5" />
              {t("skills.edit")}
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
