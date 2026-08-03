import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { useTranslation } from "@/lib/i18n/locale-provider";

import type { UserSkillCardViewModel } from "../types";

type SkillDetailDialogProps = {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  skill: UserSkillCardViewModel | null;
};

export function SkillDetailDialog({
  open,
  onOpenChange,
  skill,
}: SkillDetailDialogProps) {
  const { t } = useTranslation();

  if (!skill) {
    return null;
  }

  return (
    <Dialog onOpenChange={onOpenChange} open={open}>
      <DialogContent className="flex max-h-[min(100dvh-2rem,88dvh)] flex-col gap-3 overflow-hidden sm:max-h-none sm:max-w-lg sm:gap-4">
        <DialogHeader className="shrink-0 gap-2 text-left">
          <div className="flex flex-wrap items-center gap-2 pr-8">
            <DialogTitle>{skill.name}</DialogTitle>
            <Badge variant="secondary">
              {skill.source === "builtin"
                ? t("skills.badgeBuiltin")
                : skill.source === "workspace"
                  ? t("skills.badgeWorkspace")
                  : t("skills.badgeUser")}
            </Badge>
          </div>
          <p className="text-sm text-muted-foreground">{skill.description}</p>
          <p className="font-mono text-xs text-muted-foreground">{`/${skill.slug}`}</p>
          {skill.source === "builtin" ? (
            <p className="font-mono text-[11px] text-muted-foreground">
              {t("skills.builtinPathNote")}
            </p>
          ) : (
            <p className="font-mono text-[11px] text-muted-foreground">{skill.path}</p>
          )}
          <p className="text-xs text-muted-foreground">
            {t("skills.skillDetailTokenEstimate", { count: skill.estimatedTokens })}
          </p>
        </DialogHeader>

        <div className="min-h-0 flex-1 overflow-y-auto rounded-xl border bg-muted/30 sm:max-h-[50vh]">
          <pre className="whitespace-pre-wrap p-4 font-mono text-xs leading-relaxed">
            {skill.content}
          </pre>
        </div>

        <DialogFooter className="shrink-0">
          <Button onClick={() => onOpenChange(false)} type="button">
            {t("skills.close")}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
