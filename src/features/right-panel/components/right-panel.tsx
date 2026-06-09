"use client";

import { FilesIcon, GlobeIcon } from "lucide-react";
import { useState } from "react";

import { Button } from "@/components/ui/button";
import { useTranslation } from "@/lib/i18n/locale-provider";
import { cn } from "@/lib/utils";

import { BrowserTabPlaceholder } from "./browser-tab-placeholder";
import { WorkspaceFileTree } from "./workspace-file-tree";

type RightPanelTab = "file-tree" | "browser";

type RightPanelProps = {
  workspaceDir: string | null;
};

export function RightPanel({ workspaceDir }: RightPanelProps) {
  const { t } = useTranslation();
  const [activeTab, setActiveTab] = useState<RightPanelTab>("file-tree");

  const tabs: Array<{
    id: RightPanelTab;
    label: string;
    icon: typeof FilesIcon;
  }> = [
    {
      id: "file-tree",
      label: t("rightPanel.fileTree"),
      icon: FilesIcon,
    },
    {
      id: "browser",
      label: t("rightPanel.browser"),
      icon: GlobeIcon,
    },
  ];

  return (
    <div className="flex h-full min-h-0 flex-col border-l bg-background">
      <div className="flex items-center gap-1 border-b px-2 py-1.5">
        {tabs.map((tab) => {
          const Icon = tab.icon;
          const isActive = activeTab === tab.id;

          return (
            <Button
              key={tab.id}
              aria-label={tab.label}
              aria-pressed={isActive}
              className={cn(
                "h-7 gap-1.5 px-2 text-xs",
                isActive
                  ? "bg-muted text-foreground"
                  : "text-muted-foreground hover:text-foreground"
              )}
              onClick={() => setActiveTab(tab.id)}
              size="sm"
              type="button"
              variant="ghost"
            >
              <Icon className="size-3.5" />
              <span>{tab.label}</span>
            </Button>
          );
        })}
      </div>

      <div className="relative min-h-0 flex-1">
        <div
          className={cn(
            "absolute inset-0",
            activeTab === "file-tree"
              ? "z-10 opacity-100"
              : "pointer-events-none z-0 opacity-0"
          )}
        >
          <WorkspaceFileTree workspaceDir={workspaceDir} />
        </div>
        <div
          className={cn(
            "absolute inset-0",
            activeTab === "browser"
              ? "z-10 opacity-100"
              : "pointer-events-none z-0 opacity-0"
          )}
        >
          <BrowserTabPlaceholder />
        </div>
      </div>
    </div>
  );
}
