import { Outlet, useLocation, useOutletContext } from "react-router-dom";

import { MainColumn } from "@/components/layout/main-column";
import { AppSidebar } from "@/features/chat/components/app-sidebar";
import { useSessionTitleBarSlots } from "@/features/chat/hooks/use-session-title-bar-slots";
import { BottomPanelProvider } from "@/features/terminal/bottom-panel-context";

import type { ShellOutletContext } from "./shell-outlet-context";

/** Sidebar + main content for chat, history, skills, plugins, and automations. */
export function MainLayout() {
  const { sidebarOpen } = useOutletContext<ShellOutletContext>();
  const { pathname } = useLocation();
  const sessionTitleBar = useSessionTitleBarSlots(pathname);

  return (
    <BottomPanelProvider>
      <AppSidebar open={sidebarOpen} />

      <MainColumn
        titleBarLeading={sessionTitleBar?.leading}
        titleBarTrailing={sessionTitleBar?.trailing}
      >
        <div className="flex min-h-0 flex-1 flex-col overflow-hidden">
          <Outlet />
        </div>
      </MainColumn>
    </BottomPanelProvider>
  );
}
