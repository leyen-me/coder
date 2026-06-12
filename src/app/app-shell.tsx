import { Outlet, useLocation, useNavigate } from "react-router-dom";
import { useEffect } from "react";

import { FloatingShellNav } from "@/components/layout/floating-shell-nav";
import { useSidebarOpen } from "@/features/chat/hooks/use-sidebar-open";
import { HotkeyActionsProvider } from "@/features/keyboard-shortcuts/hotkey-actions-context";
import { KeyboardShortcuts } from "@/features/keyboard-shortcuts/keyboard-shortcuts";
import { PromptRefineProvider } from "@/features/lab/prompt-refine-provider";
import { SearchDialogProvider } from "@/features/keyboard-shortcuts/search-dialog-context";
import { ShellChromeProvider } from "@/features/keyboard-shortcuts/shell-chrome-context";
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
import {
  startAutomationScheduler,
  stopAutomationScheduler,
} from "@/features/automations/lib/scheduler";

import type { ShellOutletContext } from "./shell-outlet-context";

export function AppShell() {
  const { isOpen: isSidebarOpen, toggle: toggleSidebar } = useSidebarOpen();
  const navigate = useNavigate();
  useLocation(); // Subscribe to route changes so canGoBack recalculates
  const appWindow = useAppWindow();
  const isMaximized = useWindowMaximized(appWindow);
  const useRoundedShell = appWindow !== null && !isMaximized;

  const shellContext: ShellOutletContext = { sidebarOpen: isSidebarOpen };
  const workspaceDir = useRouteWorkspaceDir();

  const canGoBack = window.history.length > 1;
  const handleBack = () => navigate(-1);
  const handleForward = () => navigate(1);

  // Start the automation scheduler on mount; stop on unmount.
  useEffect(() => {
    startAutomationScheduler();
    return () => {
      stopAutomationScheduler();
    };
  }, []);

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
        onForward={handleForward}
        canGoBack={canGoBack}
      />

      <ShellChromeProvider toggleSidebar={toggleSidebar}>
        <SearchDialogProvider>
          <PromptRefineProvider>
          <HotkeyActionsProvider>
            <BottomPanelProvider>
              <RightPanelProvider>
                <BottomPanelPortalProvider>
                  <ShellProcessesProvider>
                    <PersistentBottomPanel workspaceDir={workspaceDir} />
                    <div className="flex min-h-0 min-w-0 flex-1 flex-row overflow-hidden">
                      <Outlet context={shellContext} />
                    </div>
                    <KeyboardShortcuts />
                  </ShellProcessesProvider>
                </BottomPanelPortalProvider>
              </RightPanelProvider>
            </BottomPanelProvider>
          </HotkeyActionsProvider>
          </PromptRefineProvider>
        </SearchDialogProvider>
      </ShellChromeProvider>
      <Toaster richColors />
      <WorkspacePathDragPreview />
    </div>
  );
}
