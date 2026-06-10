import { PlusIcon } from "lucide-react";
import { useState } from "react";

import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from "@/components/ui/alert-dialog";
import { Button } from "@/components/ui/button";
import { ScrollArea } from "@/components/ui/scroll-area";
import { Spinner } from "@/components/ui/spinner";
import { useTranslation } from "@/lib/i18n/locale-provider";

import { SkillCard } from "../components/skill-card";
import { SkillDetailDialog } from "../components/skill-detail-dialog";
import { SkillGrid } from "../components/skill-grid";
import { SkillSection } from "../components/skill-section";
import { UserSkillDialog } from "../components/user-skill-dialog";
import { useSkills } from "../hooks/use-skills";
import type { SkillCardViewModel } from "../types";
import type { EditableUserSkill } from "../types-editable";

export function SkillsPage() {
  const { t } = useTranslation();
  const {
    systemSkills,
    userSkills,
    loading,
    error,
    setSystemEnabled,
    setUserEnabled,
    removeUserSkill,
  } = useSkills();

  const [dialogOpen, setDialogOpen] = useState(false);
  const [editingSkill, setEditingSkill] = useState<EditableUserSkill | null>(null);
  const [viewingSkill, setViewingSkill] = useState<SkillCardViewModel | null>(null);
  const [deleteTarget, setDeleteTarget] = useState<EditableUserSkill | null>(null);

  const openCreateDialog = () => {
    setEditingSkill(null);
    setDialogOpen(true);
  };

  const openEditDialog = (skillId: string) => {
    const skill = userSkills.find((item) => item.id === skillId);
    if (!skill) {
      return;
    }

    setEditingSkill({
      id: skill.id,
      slug: skill.slug,
      name: skill.name,
      description: skill.description,
      content: skill.content,
    });
    setDialogOpen(true);
  };

  const openViewDialog = (skillId: string) => {
    const skill = systemSkills.find((item) => item.id === skillId);
    if (!skill) {
      return;
    }

    setViewingSkill(skill);
  };

  const handleConfirmDelete = async () => {
    if (!deleteTarget) {
      return;
    }

    await removeUserSkill(deleteTarget.id);
    setDeleteTarget(null);
  };

  return (
    <>
      <ScrollArea className="h-full min-h-0 flex-1">
        <div className="mx-auto w-full max-w-6xl space-y-10 px-6 py-6">
          {loading ? (
            <div className="flex items-center justify-center py-24">
              <Spinner className="size-6" />
            </div>
          ) : error ? (
            <div className="flex flex-col items-center justify-center gap-3 py-24 text-center">
              <p className="text-sm text-destructive">{error}</p>
              <p className="text-sm text-muted-foreground">
                {t("skills.loadFailedHint")}
              </p>
            </div>
          ) : (
            <>
              <SkillSection
                description={t("skills.systemSectionDescription")}
                title={t("skills.systemSectionTitle")}
              >
                <SkillGrid>
                  {systemSkills.map((skill) => (
                    <SkillCard
                      key={skill.id}
                      onToggleEnabled={(enabled) =>
                        void setSystemEnabled(skill.id, enabled)
                      }
                      onView={() => openViewDialog(skill.id)}
                      skill={skill}
                    />
                  ))}
                </SkillGrid>
              </SkillSection>

              <SkillSection
                action={
                  <Button onClick={openCreateDialog} size="sm" type="button">
                    <PlusIcon className="size-4" />
                    {t("skills.createSkill")}
                  </Button>
                }
                description={t("skills.userSectionDescription")}
                title={t("skills.userSectionTitle")}
              >
                {userSkills.length === 0 ? (
                  <div className="flex flex-col items-center justify-center gap-3 rounded-4xl border border-dashed py-16 text-center">
                    <p className="text-sm text-muted-foreground">
                      {t("skills.emptyUserSkills")}
                    </p>
                    <Button onClick={openCreateDialog} type="button" variant="outline">
                      {t("skills.createFirstSkill")}
                    </Button>
                  </div>
                ) : (
                  <SkillGrid>
                    {userSkills.map((skill) => (
                      <SkillCard
                        key={skill.id}
                        onDelete={() => {
                          setDeleteTarget({
                            id: skill.id,
                            slug: skill.slug,
                            name: skill.name,
                            description: skill.description,
                            content: skill.content,
                          });
                        }}
                        onEdit={() => openEditDialog(skill.id)}
                        onToggleEnabled={(enabled) =>
                          void setUserEnabled(skill.id, enabled)
                        }
                        skill={skill}
                      />
                    ))}
                  </SkillGrid>
                )}
              </SkillSection>
            </>
          )}
        </div>
      </ScrollArea>

      <UserSkillDialog
        onOpenChange={setDialogOpen}
        open={dialogOpen}
        skill={editingSkill}
      />

      <SkillDetailDialog
        onOpenChange={(open) => {
          if (!open) {
            setViewingSkill(null);
          }
        }}
        open={Boolean(viewingSkill)}
        skill={viewingSkill}
      />

      <AlertDialog
        onOpenChange={(open) => {
          if (!open) {
            setDeleteTarget(null);
          }
        }}
        open={Boolean(deleteTarget)}
      >
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>{t("skills.deleteConfirmTitle")}</AlertDialogTitle>
            <AlertDialogDescription>
              {t("skills.deleteConfirmDescription", {
                name: deleteTarget?.name ?? "",
              })}
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>{t("skills.cancel")}</AlertDialogCancel>
            <AlertDialogAction onClick={() => void handleConfirmDelete()}>
              {t("skills.delete")}
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </>
  );
}
