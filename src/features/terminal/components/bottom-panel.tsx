"use client";

import { CpuIcon, SquareTerminal } from "lucide-react";

import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { useTranslation } from "@/lib/i18n/locale-provider";

import { useBottomPanel } from "../bottom-panel-context";
import { useShellProcesses } from "../use-shell-processes";
import { ProcessesPanel } from "./processes-panel";
import { TerminalTab } from "./terminal-tab";

type BottomPanelProps = {
  workspaceDir: string | null;
};

export function BottomPanel({ workspaceDir }: BottomPanelProps) {
  const { t } = useTranslation();
  const { activeTab, setActiveTab } = useBottomPanel();
  const { processes, killProcess } = useShellProcesses();

  return (
    <div className="flex h-full min-h-0 flex-col border-t bg-background">
      <Tabs
        className="flex min-h-0 flex-1 flex-col gap-0"
        onValueChange={(value) => {
          if (value === "terminal" || value === "processes") {
            setActiveTab(value);
          }
        }}
        value={activeTab}
      >
        <div className="flex shrink-0 items-center border-b px-3 py-1.5">
          <TabsList className="h-7" variant="line">
            <TabsTrigger className="h-7 gap-1.5 px-2.5 text-xs" value="terminal">
              <SquareTerminal className="size-3.5 shrink-0" />
              {t("session.terminal")}
            </TabsTrigger>
            <TabsTrigger className="h-7 gap-1.5 px-2.5 text-xs" value="processes">
              <CpuIcon className="size-3.5 shrink-0" />
              {t("terminal.agentProcesses")}
            </TabsTrigger>
          </TabsList>
        </div>

        <TabsContent
          className="mt-0 min-h-0 flex-1 data-[state=inactive]:hidden"
          value="terminal"
        >
          <TerminalTab workspaceDir={workspaceDir} />
        </TabsContent>

        <TabsContent
          className="mt-0 min-h-0 flex-1 data-[state=inactive]:hidden"
          value="processes"
        >
          <ProcessesPanel
            className="h-full"
            onKill={(shellId) => {
              void killProcess(shellId);
            }}
            processes={processes}
          />
        </TabsContent>
      </Tabs>
    </div>
  );
}
