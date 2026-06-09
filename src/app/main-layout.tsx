import { Outlet, useLocation, useOutletContext } from "react-router-dom";

import { MainColumn } from "@/components/layout/main-column";
import { AppSidebar } from "@/features/chat/components/app-sidebar";
import { useSessionTitleBarSlots } from "@/features/chat/hooks/use-session-title-bar-slots";
import { RightPanelSlot } from "@/features/right-panel/components/right-panel-slot";
import { BottomPanelSlot } from "@/features/terminal/components/bottom-panel-slot";
import { useRouteWorkspaceDir } from "@/features/terminal/use-route-workspace-dir";

import type { ShellOutletContext } from "./shell-outlet-context";

/** Sidebar + main content for chat, history, skills, plugins, and automations. */
export function MainLayout() {
  const { sidebarOpen } = useOutletContext<ShellOutletContext>();
  const { pathname } = useLocation();
  const sessionTitleBar = useSessionTitleBarSlots(pathname);
  const workspaceDir = useRouteWorkspaceDir();

  return (
    <>
      <AppSidebar open={sidebarOpen} />

      <MainColumn
        titleBarLeading={sessionTitleBar?.leading}
        titleBarTrailing={sessionTitleBar?.trailing}
      >
        <RightPanelSlot workspaceDir={workspaceDir}>
          <BottomPanelSlot>
            <Outlet />
          </BottomPanelSlot>
        </RightPanelSlot>
      </MainColumn>
    </>
  );
}
