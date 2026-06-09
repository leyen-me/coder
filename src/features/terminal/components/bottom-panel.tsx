"use client";

import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { useTranslation } from "@/lib/i18n/locale-provider";

import { useShellProcesses } from "../use-shell-processes";
import { ProcessesTab } from "./processes-tab";
import { TerminalTab } from "./terminal-tab";

type BottomPanelProps = {
  workspaceDir: string | null;
};

export function BottomPanel({ workspaceDir }: BottomPanelProps) {
  const { t } = useTranslation();
  const { processes, killProcess } = useShellProcesses();

  return (
    <div className="flex h-full min-h-0 flex-col border-t bg-background">
      <Tabs className="flex h-full min-h-0 flex-col" defaultValue="processes">
        <div className="border-b px-3 py-1.5">
          <TabsList className="h-8">
            <TabsTrigger className="text-xs" value="processes">
              {t("terminal.processesTab")}
            </TabsTrigger>
            <TabsTrigger className="text-xs" value="terminal">
              {t("terminal.terminalTab")}
            </TabsTrigger>
          </TabsList>
        </div>

        <TabsContent className="mt-0 min-h-0 flex-1" value="processes">
          <ProcessesTab
            processes={processes}
            onKill={(shellId) => {
              void killProcess(shellId);
            }}
          />
        </TabsContent>

        <TabsContent className="mt-0 min-h-0 flex-1" value="terminal">
          <TerminalTab workspaceDir={workspaceDir} />
        </TabsContent>
      </Tabs>
    </div>
  );
}
