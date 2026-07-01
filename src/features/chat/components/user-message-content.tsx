"use client";

import { useEffect, useMemo, useState } from "react";

import { useTranslation } from "@/lib/i18n/locale-provider";
import {
  readEnabledSkillBySlug,
} from "@/features/skills/lib/resolve-skills";
import type { ResolvedSkill } from "@/features/skills/types";

import { SkillDetailDialog } from "@/features/skills/components/skill-detail-dialog";

const SKILL_SLUG_PATTERN = /\/([a-z0-9]+(?:-[a-z0-9]+)*)/g;

type Segment =
  | { kind: "text"; text: string }
  | { kind: "slug"; slug: string };

function parseSkillReferences(text: string): Segment[] {
  const segments: Segment[] = [];
  let lastIndex = 0;
  let match: RegExpExecArray | null;

  SKILL_SLUG_PATTERN.lastIndex = 0;
  while ((match = SKILL_SLUG_PATTERN.exec(text)) !== null) {
    if (match.index > lastIndex) {
      segments.push({ kind: "text", text: text.slice(lastIndex, match.index) });
    }
    segments.push({ kind: "slug", slug: match[1] });
    lastIndex = match.index + match[0].length;
  }

  if (lastIndex < text.length) {
    segments.push({ kind: "text", text: text.slice(lastIndex) });
  }

  return segments;
}

type UserMessageContentProps = {
  text: string;
};

export function UserMessageContent({ text }: UserMessageContentProps) {
  const { t } = useTranslation();
  const segments = parseSkillReferences(text);
  const [validSlugs, setValidSlugs] = useState<Set<string>>(new Set());
  const [selectedSkill, setSelectedSkill] = useState<ResolvedSkill | null>(null);
  const [isDialogOpen, setIsDialogOpen] = useState(false);

  const slugSegments = useMemo(
    () => segments.filter((s): s is { kind: "slug"; slug: string } => s.kind === "slug"),
    [segments]
  );

  // Resolve which slugs correspond to real enabled skills
  useEffect(() => {
    if (slugSegments.length === 0) {
      return;
    }

    let cancelled = false;

    async function resolve() {
      const valid = new Set<string>();
      for (const { slug } of slugSegments) {
        const result = await readEnabledSkillBySlug(slug);
        if (!cancelled && !("error" in result)) {
          valid.add(slug);
        }
      }
      if (!cancelled) {
        setValidSlugs(valid);
      }
    }

    void resolve();
    return () => {
      cancelled = true;
    };
  }, [slugSegments]);

  if (slugSegments.length === 0) {
    return <span className="block whitespace-pre-wrap break-words">{text}</span>;
  }

  const handleSlugClick = async (slug: string) => {
    const result = await readEnabledSkillBySlug(slug);
    if ("error" in result) {
      return;
    }
    setSelectedSkill(result);
    setIsDialogOpen(true);
  };

  return (
    <>
      <span className="block whitespace-pre-wrap break-words">
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
            enabled: true,
            estimatedTokens: Math.ceil(selectedSkill.content.length / 4),
          }}
        />
      ) : null}
    </>
  );
}
