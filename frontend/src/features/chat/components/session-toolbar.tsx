import { FolderOutputIcon } from "lucide-react";
import { useCallback } from "react";
import { toast } from "sonner";

import { TitleBarNavButton } from "@/components/layout/title-bar-nav-button";
import { ProviderUsageTag } from "@/features/lab/provider-usage-tag";
import { openWorkspaceInExplorer } from "@/features/workspace/open-workspace-in-explorer";
import { useTranslation } from "@/lib/i18n/locale-provider";
import type { ProviderId } from "@/lib/model-provider/types";

type SessionToolbarProps = {
  sessionProvider?: ProviderId | null;
  workspaceDir?: string | null;
};

export function SessionToolbar({
  sessionProvider,
  workspaceDir,
}: SessionToolbarProps) {
  const { t } = useTranslation();
  const hasWorkspace = Boolean(workspaceDir?.trim());

  const handleOpenInExplorer = useCallback(() => {
    const path = workspaceDir?.trim();
    if (!path) {
      return;
    }

    void (async () => {
      const result = await openWorkspaceInExplorer(path);
      if (result.ok) {
        return;
      }
      toast.error(result.message || t("session.openWorkspaceInExplorerFailed"));
    })();
  }, [t, workspaceDir]);

  return (
    <div className="flex shrink-0 items-center gap-1">
      {hasWorkspace ? (
        <TitleBarNavButton
          icon={FolderOutputIcon}
          label={t("session.openWorkspaceInExplorer")}
          onClick={handleOpenInExplorer}
        />
      ) : null}
      <ProviderUsageTag providerId={sessionProvider} />
    </div>
  );
}
