"use client";

import {
  FileTree,
  FileTreeFile,
  FileTreeFolder,
} from "@/components/ai-elements/file-tree";
import { ScrollArea } from "@/components/ui/scroll-area";
import type { ListDirEntry } from "@/features/agent/tools/types";
import { useTranslation } from "@/lib/i18n/locale-provider";
import { cn } from "@/lib/utils";

import { useWorkspaceFileTree } from "../hooks/use-workspace-file-tree";

type WorkspaceFileTreeProps = {
  workspaceDir: string | null;
  className?: string;
};

function renderTreeEntries(
  entries: ListDirEntry[],
  entriesByPath: Map<string, ListDirEntry[]>
) {
  return entries.map((entry) => {
    if (entry.isDir) {
      const children = entriesByPath.get(entry.path) ?? [];

      return (
        <FileTreeFolder key={entry.path} name={entry.name} path={entry.path}>
          {children.length > 0
            ? renderTreeEntries(children, entriesByPath)
            : null}
        </FileTreeFolder>
      );
    }

    return (
      <FileTreeFile key={entry.path} name={entry.name} path={entry.path} />
    );
  });
}

export function WorkspaceFileTree({
  workspaceDir,
  className,
}: WorkspaceFileTreeProps) {
  const { t } = useTranslation();
  const {
    rootPath,
    entriesByPath,
    expanded,
    selectedPath,
    loading,
    error,
    setSelectedPath,
    handleExpandedChange,
  } = useWorkspaceFileTree(workspaceDir);

  if (!workspaceDir) {
    return (
      <div className="flex h-full items-center justify-center px-4 text-center text-sm text-muted-foreground">
        {t("rightPanel.noWorkspace")}
      </div>
    );
  }

  if (error) {
    return (
      <div className="flex h-full items-center justify-center px-4 text-center text-sm text-destructive">
        {error}
      </div>
    );
  }

  const rootEntries = rootPath ? (entriesByPath.get(rootPath) ?? []) : [];

  return (
    <ScrollArea className={cn("h-full min-h-0", className)}>
      <div className="p-2">
        {loading && rootEntries.length === 0 ? (
          <div className="px-2 py-4 text-sm text-muted-foreground">
            {t("rightPanel.loading")}
          </div>
        ) : (
          <FileTree
            className="border-none bg-transparent p-0"
            expanded={expanded}
            onExpandedChange={handleExpandedChange}
            onSelect={setSelectedPath}
            selectedPath={selectedPath}
          >
            {renderTreeEntries(rootEntries, entriesByPath)}
          </FileTree>
        )}
      </div>
    </ScrollArea>
  );
}
