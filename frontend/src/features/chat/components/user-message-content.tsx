"use client";

import { useEffect, useMemo, useState } from "react";

import { listAvailableSkills } from "@/features/skills/api";
import { SkillDetailDialog } from "@/features/skills/components/skill-detail-dialog";
import { resolveWorkspaceAwareSkillsBySlugs } from "@/features/skills/lib/resolve-skills";
import type { ResolvedSkill } from "@/features/skills/types";
import { useTranslation } from "@/lib/i18n/locale-provider";

const SKILL_SLUG_PATTERN = /(?:^|\s)\/([a-z0-9]+(?:-[a-z0-9]+)*)/g;

type Segment =
  | { kind: "text"; text: string }
  | { kind: "slug"; slug: string };

function parseSkillReferences(
  text: string,
  referencedSkills?: readonly string[]
): Segment[] {
  const allowedSlugs = referencedSkills ? new Set(referencedSkills) : null;
  const segments: Segment[] = [];
  let lastIndex = 0;
  let match: RegExpExecArray | null;

  SKILL_SLUG_PATTERN.lastIndex = 0;
  while ((match = SKILL_SLUG_PATTERN.exec(text)) !== null) {
    const slugStart = match.index + match[0].lastIndexOf("/");
    if (slugStart > lastIndex) {
      segments.push({ kind: "text", text: text.slice(lastIndex, slugStart) });
    }

    if (!allowedSlugs || allowedSlugs.has(match[1])) {
      segments.push({ kind: "slug", slug: match[1] });
    } else {
      segments.push({
        kind: "text",
        text: text.slice(slugStart, slugStart + match[1].length + 1),
      });
    }
    lastIndex = slugStart + match[1].length + 1;
  }

  if (lastIndex < text.length) {
    segments.push({ kind: "text", text: text.slice(lastIndex) });
  }

  return segments;
}

function sameStringSet(left: Set<string>, right: Set<string>): boolean {
  if (left.size !== right.size) {
    return false;
  }
  for (const value of left) {
    if (!right.has(value)) {
      return false;
    }
  }
  return true;
}

type UserMessageContentProps = {
  text: string;
  referencedSkills?: readonly string[];
};

export function UserMessageContent({
  text,
  referencedSkills,
}: UserMessageContentProps) {
  const { t } = useTranslation();
  const referencedSkillsKey = referencedSkills?.join("\0") ?? "";
  const referencedSkillsSnapshot = useMemo(
    () => (referencedSkillsKey ? referencedSkillsKey.split("\0") : undefined),
    [referencedSkillsKey]
  );
  const segments = useMemo(
    () => parseSkillReferences(text, referencedSkillsSnapshot),
    [text, referencedSkillsSnapshot]
  );
  const uniqueSlugsKey = useMemo(() => {
    const seen = new Set<string>();
    const slugs: string[] = [];
    for (const segment of segments) {
      if (segment.kind === "slug" && !seen.has(segment.slug)) {
        seen.add(segment.slug);
        slugs.push(segment.slug);
      }
    }
    return slugs.join("\0");
  }, [segments]);

  const [validSlugs, setValidSlugs] = useState<Set<string>>(new Set());
  const [selectedSkill, setSelectedSkill] = useState<ResolvedSkill | null>(null);
  const [isDialogOpen, setIsDialogOpen] = useState(false);

  // Resolve which slugs still exist. Use the catalog (soft) so a deleted skill
  // does not 400 the whole batch, and keep deps content-stable to avoid loops.
  useEffect(() => {
    if (!uniqueSlugsKey) {
      setValidSlugs((prev) => (prev.size === 0 ? prev : new Set()));
      return;
    }

    const uniqueSlugs = uniqueSlugsKey.split("\0");
    let cancelled = false;

    async function resolve() {
      try {
        const catalog = await listAvailableSkills(null);
        if (cancelled) {
          return;
        }
        const available = new Set(catalog.skills.map((skill) => skill.slug));
        const next = new Set(uniqueSlugs.filter((slug) => available.has(slug)));
        setValidSlugs((prev) => (sameStringSet(prev, next) ? prev : next));
      } catch {
        if (!cancelled) {
          setValidSlugs((prev) => (prev.size === 0 ? prev : new Set()));
        }
      }
    }

    void resolve();
    return () => {
      cancelled = true;
    };
  }, [uniqueSlugsKey]);

  if (!uniqueSlugsKey) {
    return <span className="block whitespace-pre-wrap wrap-break-word">{text}</span>;
  }

  const handleSlugClick = async (slug: string) => {
    const result = await resolveWorkspaceAwareSkillsBySlugs(null, [slug]);
    if (!result.ok || result.skills.length === 0) {
      // Skill disappeared between catalog check and click — drop the highlight.
      setValidSlugs((prev) => {
        if (!prev.has(slug)) {
          return prev;
        }
        const next = new Set(prev);
        next.delete(slug);
        return next;
      });
      return;
    }
    setSelectedSkill(result.skills[0] ?? null);
    setIsDialogOpen(true);
  };

  return (
    <>
      <span className="block whitespace-pre-wrap wrap-break-word">
        {segments.map((segment, index) => {
          if (segment.kind === "text") {
            return <span key={index}>{segment.text}</span>;
          }
          if (!validSlugs.has(segment.slug)) {
            return <span key={index}>/{segment.slug}</span>;
          }
          return (
            <button
              key={index}
              type="button"
              className="inline-flex cursor-pointer items-baseline border-b border-dotted border-primary/40 font-mono text-xs font-medium text-primary/70 hover:border-primary/70 hover:text-primary"
              onClick={() => {
                void handleSlugClick(segment.slug);
              }}
              title={t("chat.skillReferenceTooltip")}
            >
              /{segment.slug}
            </button>
          );
        })}
      </span>
      {selectedSkill ? (
        <SkillDetailDialog
          open={isDialogOpen}
          onOpenChange={(open) => {
            setIsDialogOpen(open);
            if (!open) {
              setSelectedSkill(null);
            }
          }}
          skill={{
            ...selectedSkill,
            estimatedTokens: Math.ceil(selectedSkill.content.length / 4),
          }}
        />
      ) : null}
    </>
  );
}
