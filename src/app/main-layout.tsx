import { Outlet, useLocation, useOutletContext } from "react-router-dom";

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

      <div className="flex min-w-0 flex-1 flex-col">
        {isChatRoute(pathname) ? <SessionHeader /> : null}
        <Outlet />
      </div>
    </>
  );
}
