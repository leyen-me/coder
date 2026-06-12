"use client";

import { XIcon } from "lucide-react";

import { Button } from "@/components/ui/button";
import { ScrollArea } from "@/components/ui/scroll-area";
import { useTranslation } from "@/lib/i18n/locale-provider";

type DiffViewerProps = {
  diff: string;
  fileName: string;
  onClose: () => void;
};

export function DiffViewer({ diff, fileName, onClose }: DiffViewerProps) {
  const { t } = useTranslation();

  return (
    <div className="flex h-full min-h-0 flex-col">
      <div className="flex items-center gap-2 border-b px-3 py-1.5">
        <span className="min-w-0 flex-1 truncate text-xs font-medium">
          {fileName}
        </span>
        <Button
          className="size-6 shrink-0"
          onClick={onClose}
          size="icon-sm"
          type="button"
          variant="ghost"
        >
          <XIcon className="size-3" />
        </Button>
      </div>
      <ScrollArea className="flex-1">
        <pre className="p-3 font-mono text-[11px] leading-relaxed">
          {diff || t("git.noChanges")}
        </pre>
      </ScrollArea>
    </div>
  );
}
