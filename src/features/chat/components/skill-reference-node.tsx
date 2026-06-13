import { NodeViewWrapper, type NodeViewProps } from "@tiptap/react";
import { SparklesIcon, XIcon } from "lucide-react";

import { useTranslation } from "@/lib/i18n/locale-provider";
import { cn } from "@/lib/utils";

export function SkillReferenceNodeView({
  node,
  deleteNode,
  selected,
}: NodeViewProps) {
  const { t } = useTranslation();
  const { slug, name } = node.attrs as {
    slug: string;
    name: string;
  };

  return (
    <NodeViewWrapper as="span" className="inline">
      <span
        className={cn(
          "mx-0.5 inline-flex max-w-full items-center gap-1 rounded-full border border-primary/20 bg-primary/5 py-0.5 pr-0.5 pl-1.5 align-middle text-xs text-foreground",
          selected && "border-primary/40 ring-1 ring-primary/20"
        )}
        contentEditable={false}
        data-skill-reference="true"
      >
        <SparklesIcon className="size-3 shrink-0 opacity-70" />
        <span className="max-w-48 truncate font-mono">/{slug || name}</span>
        <button
          aria-label={t("chat.removeSkillReference")}
          className="inline-flex size-4 shrink-0 items-center justify-center rounded-full text-muted-foreground transition-colors hover:bg-muted hover:text-foreground"
          onClick={(event) => {
            event.preventDefault();
            event.stopPropagation();
            deleteNode();
          }}
          onMouseDown={(event) => {
            event.preventDefault();
          }}
          type="button"
        >
          <XIcon className="size-3" strokeWidth={2.5} />
        </button>
      </span>
    </NodeViewWrapper>
  );
}
