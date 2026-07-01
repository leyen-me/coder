import { Outlet, useNavigate, useNavigationType } from "react-router-dom";
import { useCallback, useEffect, useState } from "react";
import { isTauri } from "@tauri-apps/api/core";

import { FloatingShellNav } from "@/components/layout/floating-shell-nav";
import { useSidebarOpen } from "@/features/chat/hooks/use-sidebar-open";
import { HotkeyActionsProvider } from "@/features/keyboard-shortcuts/hotkey-actions-context";
import { KeyboardShortcuts } from "@/features/keyboard-shortcuts/keyboard-shortcuts";
import { PromptRefineProvider } from "@/features/lab/prompt-refine-provider";
import { SearchDialogProvider } from "@/features/keyboard-shortcuts/search-dialog-context";
import { ShellChromeProvider } from "@/features/keyboard-shortcuts/shell-chrome-context";
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
import { initCoderStorage } from "@/lib/storage/init";

import type { ShellOutletContext } from "./shell-outlet-context";

export function AppShell() {
  const { isOpen: isSidebarOpen, toggle: toggleSidebar } = useSidebarOpen();
  const navigate = useNavigate();
  const navigationType = useNavigationType();
  const appWindow = useAppWindow();
  const isMaximized = useWindowMaximized(appWindow);
  const useRoundedShell = appWindow !== null && !isMaximized;

  const shellContext: ShellOutletContext = { sidebarOpen: isSidebarOpen };
  const workspaceDir = useRouteWorkspaceDir();

  const handleBack = () => navigate(-1);

  // Determine if the user can go back by reading the history index from
  // React Router's browser history state. This handles page reload correctly
  // since the browser persists history.state across reloads.
  // We use window.history.state.idx (set by React Router's createBrowserHistory)
  // rather than window.history.length, which doesn't shrink after POP.
  const getHistoryIdx = useCallback(() => {
    return ((window.history.state as { idx?: number } | null)?.idx ?? -1);
  }, []);

  const [canGoBack, setCanGoBack] = useState(() => getHistoryIdx() > 0);

  useEffect(() => {
    // After each navigation, re-read the history index.
    // React Router synchronously updates history.state before this effect runs,
    // so no delay is needed.
    setCanGoBack(getHistoryIdx() > 0);
  }, [navigationType, getHistoryIdx]);

  // Start the automation scheduler on mount; stop on unmount.
  useEffect(() => {
    startAutomationScheduler();
    return () => {
      stopAutomationScheduler();
    };
  }, []);

  // Initialize ~/.coder/ storage when running inside Tauri.
  useEffect(() => {
    if (isTauri()) {
      void initCoderStorage();
    }
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
        canGoBack={canGoBack}
      />

      <ShellChromeProvider toggleSidebar={toggleSidebar}>
        <SearchDialogProvider>
          <PromptRefineProvider>
          <HotkeyActionsProvider>
            <BottomPanelProvider>
              <BottomPanelPortalProvider>
                <ShellProcessesProvider>
                  <PersistentBottomPanel workspaceDir={workspaceDir} />
                  <div className="flex min-h-0 min-w-0 flex-1 flex-row overflow-hidden">
                    <Outlet context={shellContext} />
                  </div>
                  <KeyboardShortcuts />
                </ShellProcessesProvider>
              </BottomPanelPortalProvider>
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
