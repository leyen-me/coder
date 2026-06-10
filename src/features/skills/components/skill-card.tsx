import { PencilIcon, Trash2Icon } from "lucide-react";

import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { useTranslation } from "@/lib/i18n/locale-provider";
import { cn } from "@/lib/utils";

import type { SkillCardViewModel } from "../types";
import { SkillEnableToggle } from "./skill-enable-toggle";

type SkillCardProps = {
  skill: SkillCardViewModel;
  onToggleEnabled: (enabled: boolean) => void;
  onEdit?: () => void;
  onDelete?: () => void;
};

export function SkillCard({
  skill,
  onToggleEnabled,
  onEdit,
  onDelete,
}: SkillCardProps) {
  const { t } = useTranslation();
  const isUser = skill.source === "user";

  return (
    <Card
      className={cn(
        "relative gap-3 py-4 [--card-spacing:--spacing(4)]",
        !skill.enabled && "opacity-70"
      )}
      size="sm"
    >
      <div className="absolute top-3 right-3">
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

      <div
        className={cn("space-y-2 pr-10", isUser && onEdit && "cursor-pointer")}
        onClick={isUser && onEdit ? onEdit : undefined}
        onKeyDown={
          isUser && onEdit
            ? (event) => {
                if (event.key === "Enter" || event.key === " ") {
                  event.preventDefault();
                  onEdit();
                }
              }
            : undefined
        }
        role={isUser && onEdit ? "button" : undefined}
        tabIndex={isUser && onEdit ? 0 : undefined}
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
      </div>

      {isUser && (onEdit || onDelete) ? (
        <div className="flex items-center gap-2 px-(--card-spacing)">
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
        </div>
      ) : null}
    </Card>
  );
}
