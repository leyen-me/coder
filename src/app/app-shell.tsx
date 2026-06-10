import { Outlet, useLocation, useNavigate } from "react-router-dom";

import { FloatingShellNav } from "@/components/layout/floating-shell-nav";
import { useSidebarOpen } from "@/features/chat/hooks/use-sidebar-open";
import { RightPanelProvider } from "@/features/right-panel/right-panel-context";
import { BottomPanelProvider } from "@/features/terminal/bottom-panel-context";
import { BottomPanelPortalProvider } from "@/features/terminal/bottom-panel-portal-context";
import { PersistentBottomPanel } from "@/features/terminal/components/persistent-bottom-panel";
import { ShellProcessesProvider } from "@/features/terminal/shell-processes-context";
import { useRouteWorkspaceDir } from "@/features/terminal/use-route-workspace-dir";
import { Toaster } from "@/components/ui/sonner";
import { WorkspacePathDragPreview } from "@/components/dnd/workspace-path-drag-preview";
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
  const workspaceDir = useRouteWorkspaceDir();

  const handleBack = isSettingsRoute(pathname)
    ? () => {
        navigate(paths.chatNew);
      }
    : undefined;

  return (
    <div
      className={cn(
        "relative flex h-svh flex-row overflow-hidden bg-background",
        useRoundedShell && "rounded-(--window-radius)",
      )}
    >
      <FloatingShellNav
        isSidebarOpen={isSidebarOpen}
        onToggleSidebar={toggleSidebar}
        onBack={handleBack}
      />

      <BottomPanelProvider>
        <RightPanelProvider>
          <BottomPanelPortalProvider>
            <ShellProcessesProvider>
              <PersistentBottomPanel workspaceDir={workspaceDir} />
              <div className="flex min-h-0 min-w-0 flex-1 flex-row overflow-hidden">
                <Outlet context={shellContext} />
              </div>
            </ShellProcessesProvider>
          </BottomPanelPortalProvider>
        </RightPanelProvider>
      </BottomPanelProvider>
      <Toaster richColors />
      <WorkspacePathDragPreview />
    </div>
  );
}
