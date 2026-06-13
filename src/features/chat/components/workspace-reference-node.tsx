import { NodeViewWrapper, type NodeViewProps } from "@tiptap/react";
import { FileIcon, FolderIcon, XIcon } from "lucide-react";

import { useTranslation } from "@/lib/i18n/locale-provider";
import { cn } from "@/lib/utils";

export function WorkspaceReferenceNodeView({
  node,
  deleteNode,
  selected,
}: NodeViewProps) {
  const { t } = useTranslation();
  const { name, isDir } = node.attrs as {
    name: string;
    isDir: boolean;
  };
  const Icon = isDir ? FolderIcon : FileIcon;

  return (
    <NodeViewWrapper as="span" className="inline">
      <span
        className={cn(
          "mx-0.5 inline-flex max-w-full items-center gap-1 rounded-full border bg-muted/50 py-0.5 pr-0.5 pl-1.5 align-middle text-xs font-mono text-foreground",
          selected && "border-primary/40 ring-1 ring-primary/20"
        )}
        contentEditable={false}
        data-workspace-reference="true"
      >
        <Icon className="size-3 shrink-0 opacity-70" />
        <span className="max-w-48 truncate">{name}</span>
        <button
          aria-label={t("chat.removeReference")}
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
