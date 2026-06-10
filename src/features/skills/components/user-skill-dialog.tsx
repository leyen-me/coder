import { useEffect, useState } from "react";
import { toast } from "sonner";

import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import {
  createUserSkill,
  isValidSkillSlug,
  updateUserSkill,
} from "@/lib/db";
import { useTranslation } from "@/lib/i18n/locale-provider";

import { assertUserSkillSlugAvailable } from "../lib/resolve-skills";
import type { EditableUserSkill } from "../types-editable";

type UserSkillDialogProps = {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  skill?: EditableUserSkill | null;
};

type FormState = {
  slug: string;
  name: string;
  description: string;
  content: string;
};

const EMPTY_FORM: FormState = {
  slug: "",
  name: "",
  description: "",
  content: "",
};

export function UserSkillDialog({
  open,
  onOpenChange,
  skill,
}: UserSkillDialogProps) {
  const { t } = useTranslation();
  const [form, setForm] = useState<FormState>(EMPTY_FORM);
  const [saving, setSaving] = useState(false);
  const isEditing = Boolean(skill);

  useEffect(() => {
    if (!open) {
      return;
    }

    if (skill) {
      setForm({
        slug: skill.slug,
        name: skill.name,
        description: skill.description,
        content: skill.content,
      });
      return;
    }

    setForm(EMPTY_FORM);
  }, [open, skill]);

  const handleSave = async () => {
    const slug = form.slug.trim();
    const name = form.name.trim();
    const description = form.description.trim();
    const content = form.content;

    if (!slug || !name || !description.trim() || !content.trim()) {
      toast.error(t("skills.formValidationRequired"));
      return;
    }

    if (!isValidSkillSlug(slug)) {
      toast.error(t("skills.formValidationSlug"));
      return;
    }

    setSaving(true);
    try {
      assertUserSkillSlugAvailable(slug, skill?.slug);

      if (skill) {
        await updateUserSkill(skill.id, {
          slug,
          name,
          description,
          content,
        });
        toast.success(t("skills.updated"));
      } else {
        await createUserSkill({ slug, name, description, content });
        toast.success(t("skills.created"));
        toast.message(t("skills.createdHint"));
      }

      onOpenChange(false);
    } catch (error) {
      const message =
        error instanceof Error ? error.message : t("skills.saveFailed");
      toast.error(message);
    } finally {
      setSaving(false);
    }
  };

  return (
    <Dialog onOpenChange={onOpenChange} open={open}>
      <DialogContent className="max-w-lg">
        <DialogHeader>
          <DialogTitle>
            {isEditing ? t("skills.editSkill") : t("skills.createSkill")}
          </DialogTitle>
        </DialogHeader>

        <div className="space-y-4">
          <div className="space-y-2">
            <Label htmlFor="skill-slug">{t("skills.fieldSlug")}</Label>
            <Input
              id="skill-slug"
              onChange={(event) =>
                setForm((current) => ({ ...current, slug: event.target.value }))
              }
              placeholder="my-skill"
              value={form.slug}
            />
          </div>

          <div className="space-y-2">
            <Label htmlFor="skill-name">{t("skills.fieldName")}</Label>
            <Input
              id="skill-name"
              onChange={(event) =>
                setForm((current) => ({ ...current, name: event.target.value }))
              }
              value={form.name}
            />
          </div>

          <div className="space-y-2">
            <Label htmlFor="skill-description">{t("skills.fieldDescription")}</Label>
            <Textarea
              id="skill-description"
              onChange={(event) =>
                setForm((current) => ({
                  ...current,
                  description: event.target.value,
                }))
              }
              rows={2}
              value={form.description}
            />
          </div>

          <div className="space-y-2">
            <Label htmlFor="skill-content">{t("skills.fieldContent")}</Label>
            <Textarea
              className="min-h-40 font-mono text-xs"
              id="skill-content"
              onChange={(event) =>
                setForm((current) => ({
                  ...current,
                  content: event.target.value,
                }))
              }
              value={form.content}
            />
          </div>
        </div>

        <DialogFooter>
          <Button
            disabled={saving}
            onClick={() => onOpenChange(false)}
            type="button"
            variant="outline"
          >
            {t("skills.cancel")}
          </Button>
          <Button disabled={saving} onClick={() => void handleSave()} type="button">
            {isEditing ? t("skills.save") : t("skills.create")}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
