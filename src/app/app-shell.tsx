import { Outlet, useLocation, useNavigate } from "react-router-dom";

import { TitleBar } from "@/components/layout/title-bar";
import { useSidebarOpen } from "@/features/chat/hooks/use-sidebar-open";
import { useAppWindow } from "@/lib/tauri/use-app-window";
import { useWindowMaximized } from "@/lib/tauri/use-window-maximized";
import { cn } from "@/lib/utils";

import { paths } from "./paths";
import type { ShellOutletContext } from "./shell-outlet-context";

function isSettingsRoute(pathname: string): boolean {
  return pathname.startsWith(paths.settings);
}

export function AppShell() {
  const { isOpen: isSidebarOpen, toggle: toggleSidebar } = useSidebarOpen();
  const { pathname } = useLocation();
  const navigate = useNavigate();
  const appWindow = useAppWindow();
  const isMaximized = useWindowMaximized(appWindow);
  const useRoundedShell = appWindow !== null && !isMaximized;

  const shellContext: ShellOutletContext = { sidebarOpen: isSidebarOpen };

  const handleBack = isSettingsRoute(pathname)
    ? () => {
        navigate(paths.chatNew);
      }
    : undefined;

  return (
    <div
      className={cn(
        "flex h-svh flex-col overflow-hidden bg-background",
        useRoundedShell && "rounded-[var(--window-radius)]",
      )}
    >
      <TitleBar
        isSidebarOpen={isSidebarOpen}
        onToggleSidebar={toggleSidebar}
        onBack={handleBack}
      />

      <div className="flex min-h-0 flex-1 overflow-hidden">
        <Outlet context={shellContext} />
      </div>
    </div>
  );
}
