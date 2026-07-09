import { FolderOpenIcon, UploadIcon } from "lucide-react";
import { useRef, useState, type ChangeEvent } from "react";
import { toast } from "sonner";

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
import { importUserSkillZip } from "@/features/skills/api";
import { openPathInExplorer } from "@/features/workspace/open-path-in-explorer";
import { useTranslation } from "@/lib/i18n/locale-provider";

import { SkillCard } from "../components/skill-card";
import { SkillDetailDialog } from "../components/skill-detail-dialog";
import { SkillGrid } from "../components/skill-grid";
import { SkillSection } from "../components/skill-section";
import { useSkills } from "../hooks/use-skills";
import type { UserSkillCardViewModel } from "../types";

export function SkillsPage() {
  const { t } = useTranslation();
  const { userSkills, userSkillsRootPath, loading, error, refresh, removeUserSkill } =
    useSkills();

  const fileInputRef = useRef<HTMLInputElement | null>(null);
  const [importing, setImporting] = useState(false);
  const [viewingSkill, setViewingSkill] = useState<UserSkillCardViewModel | null>(null);
  const [deleteTarget, setDeleteTarget] = useState<UserSkillCardViewModel | null>(null);

  const handleImportClick = () => {
    fileInputRef.current?.click();
  };

  const handleImportChange = async (event: ChangeEvent<HTMLInputElement>) => {
    const file = event.target.files?.[0];
    event.target.value = "";
    if (!file) {
      return;
    }

    setImporting(true);
    try {
      const skill = await importUserSkillZip(file);
      await refresh();
      toast.success(t("skills.imported", { name: skill.name }));
    } catch (cause) {
      const message =
        cause instanceof Error ? cause.message : t("skills.importFailed");
      toast.error(message);
    } finally {
      setImporting(false);
    }
  };

  const handleOpenRootFolder = async () => {
    const result = await openPathInExplorer(userSkillsRootPath);
    if (!result.ok) {
      toast.error(result.message || t("skills.openFolderFailed"));
    }
  };

  const handleOpenSkillFolder = async (path: string) => {
    const result = await openPathInExplorer(path);
    if (!result.ok) {
      toast.error(result.message || t("skills.openFolderFailed"));
    }
  };

  const handleConfirmDelete = async () => {
    if (!deleteTarget) {
      return;
    }

    await removeUserSkill(deleteTarget.slug);
    toast.success(t("skills.deleted", { name: deleteTarget.name }));
    setDeleteTarget(null);
  };

  return (
    <>
      <ScrollArea className="h-full min-h-0 flex-1">
        <div className="mx-auto w-full max-w-6xl space-y-8 px-4 py-4 md:space-y-10 md:px-6 md:py-6">
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
                action={
                  <div className="flex flex-wrap gap-2">
                    <input
                      ref={fileInputRef}
                      accept=".zip,application/zip"
                      className="hidden"
                      onChange={(event) => void handleImportChange(event)}
                      type="file"
                    />
                    <Button
                      disabled={importing}
                      onClick={handleImportClick}
                      size="sm"
                      type="button"
                    >
                      <UploadIcon className="size-4" />
                      {importing ? t("skills.importing") : t("skills.importSkill")}
                    </Button>
                    <Button
                      disabled={!userSkillsRootPath}
                      onClick={() => void handleOpenRootFolder()}
                      size="sm"
                      type="button"
                      variant="outline"
                    >
                      <FolderOpenIcon className="size-4" />
                      {t("skills.openRootFolder")}
                    </Button>
                  </div>
                }
                description={t("skills.userSectionDescription")}
                title={t("skills.userSectionTitle")}
              >
                {userSkillsRootPath ? (
                  <div className="rounded-2xl border bg-muted/20 px-4 py-3 font-mono text-xs text-muted-foreground">
                    {userSkillsRootPath}
                  </div>
                ) : null}

                {userSkills.length === 0 ? (
                  <div className="flex flex-col items-center justify-center gap-3 rounded-4xl border border-dashed py-16 text-center">
                    <p className="text-sm text-muted-foreground">
                      {t("skills.emptyUserSkills")}
                    </p>
                    <Button onClick={handleImportClick} type="button" variant="outline">
                      {t("skills.importFirstSkill")}
                    </Button>
                  </div>
                ) : (
                  <SkillGrid>
                    {userSkills.map((skill) => (
                      <SkillCard
                        key={`${skill.source}:${skill.slug}`}
                        onDelete={() => {
                          setDeleteTarget(skill);
                        }}
                        onOpenFolder={() => void handleOpenSkillFolder(skill.directoryPath)}
                        onView={() => setViewingSkill(skill)}
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
