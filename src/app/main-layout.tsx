import { Outlet, useLocation, useOutletContext } from "react-router-dom";

import { MainColumn } from "@/components/layout/main-column";
import { AppSidebar } from "@/features/chat/components/app-sidebar";
import { SessionHeader } from "@/features/chat/components/session-header";

import { paths } from "./paths";
import type { ShellOutletContext } from "./shell-outlet-context";

function isChatRoute(pathname: string): boolean {
  return pathname === paths.chatNew || /^\/chat\/[^/]+$/.test(pathname);
}

/** Sidebar + main content for chat, history, skills, plugins, and automations. */
export function MainLayout() {
  const { sidebarOpen } = useOutletContext<ShellOutletContext>();
  const { pathname } = useLocation();

  return (
    <>
      <AppSidebar open={sidebarOpen} />

      <MainColumn>
        {isChatRoute(pathname) ? <SessionHeader /> : null}
        <div className="flex min-h-0 flex-1 flex-col overflow-hidden">
          <Outlet />
        </div>
      </MainColumn>
    </>
  );
}
