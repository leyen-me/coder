import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { ScrollArea } from "@/components/ui/scroll-area";
import { useTranslation } from "@/lib/i18n/locale-provider";

import type { SkillCardViewModel } from "../types";

type SkillDetailDialogProps = {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  skill: SkillCardViewModel | null;
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

  const isSystem = skill.source === "system";

  return (
    <Dialog onOpenChange={onOpenChange} open={open}>
      <DialogContent className="flex max-h-[min(85vh,720px)] max-w-lg flex-col gap-4">
        <DialogHeader className="gap-2 text-left">
          <div className="flex flex-wrap items-center gap-2 pr-8">
            <DialogTitle>{skill.name}</DialogTitle>
            <Badge variant="secondary">
              {isSystem ? t("skills.badgeSystem") : t("skills.badgeUser")}
            </Badge>
          </div>
          <p className="text-sm text-muted-foreground">{skill.description}</p>
          <p className="font-mono text-xs text-muted-foreground">
            {isSystem
              ? t("skills.estimatedTokens", { count: skill.estimatedTokens })
              : `/${skill.slug}`}
          </p>
          {isSystem ? (
            <p className="text-xs text-muted-foreground">
              {t("skills.systemSkillReadOnlyHint")}
            </p>
          ) : null}
        </DialogHeader>

        <ScrollArea className="min-h-0 flex-1 rounded-xl border bg-muted/30">
          <pre className="whitespace-pre-wrap p-4 font-mono text-xs leading-relaxed">
            {skill.content}
          </pre>
        </ScrollArea>

        <DialogFooter>
          <Button onClick={() => onOpenChange(false)} type="button">
            {t("skills.close")}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
