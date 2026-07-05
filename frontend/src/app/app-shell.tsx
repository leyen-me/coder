import { Outlet, useLocation } from "react-router-dom";
import { useEffect } from "react";

import { FloatingShellNav } from "@/components/layout/floating-shell-nav";
import { ErrorBoundary } from "@/components/error-boundary";
import { useSearchDialog } from "@/features/keyboard-shortcuts/search-dialog-context";
import { useSidebarOpen } from "@/features/chat/hooks/use-sidebar-open";
import { paths } from "@/app/paths";
import { HotkeyActionsProvider } from "@/features/keyboard-shortcuts/hotkey-actions-context";
import { KeyboardShortcuts } from "@/features/keyboard-shortcuts/keyboard-shortcuts";
import { PromptRefineProvider } from "@/features/lab/prompt-refine-provider";
import { SearchDialogProvider } from "@/features/keyboard-shortcuts/search-dialog-context";
import { ShellChromeProvider } from "@/features/keyboard-shortcuts/shell-chrome-context";
import { Toaster } from "@/components/ui/sonner";
import { cn } from "@/lib/utils";
import {
  startAutomationScheduler,
  stopAutomationScheduler,
} from "@/features/automations/lib/scheduler";
import {
  initCoderStorageSync,
} from "@/lib/storage/init";

// Initialize storage backends synchronously before React renders.
initCoderStorageSync();

import type { ShellOutletContext } from "./shell-outlet-context";
/** Nav bar that uses useSearchDialog, rendered inside SearchDialogProvider. */
function ShellFloatingNav({
  isSidebarOpen,
  toggleSidebar,
  showSearch,
}: {
  isSidebarOpen: boolean;
  toggleSidebar: () => void;
  showSearch: boolean;
}) {
  const { open: openSearch } = useSearchDialog();
  return (
    <FloatingShellNav
      isSidebarOpen={isSidebarOpen}
      onToggleSidebar={toggleSidebar}
      onSearch={openSearch}
      showSearch={showSearch}
    />
  );
}

export function AppShell() {
  const { isOpen: isSidebarOpen, toggle: toggleSidebar } = useSidebarOpen();
  const location = useLocation();
  const shellContext: ShellOutletContext = { sidebarOpen: isSidebarOpen };
  const showSearch = location.pathname !== paths.settings;

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
      )}
    >
      <ShellChromeProvider toggleSidebar={toggleSidebar}>
        <SearchDialogProvider>
          <ShellFloatingNav
            isSidebarOpen={isSidebarOpen}
            toggleSidebar={toggleSidebar}
            showSearch={showSearch}
          />
          <PromptRefineProvider>
          <HotkeyActionsProvider>
            <div className="flex min-h-0 min-w-0 flex-1 flex-row overflow-hidden">
              <ErrorBoundary
                className="flex min-h-0 min-w-0 flex-1 items-center justify-center bg-background px-6 py-8"
                title="Workspace failed to render"
                description="This section hit a rendering error. Retry the view or reload the app to recover."
              >
                <Outlet context={shellContext} />
              </ErrorBoundary>
            </div>
            <KeyboardShortcuts />
          </HotkeyActionsProvider>
          </PromptRefineProvider>
        </SearchDialogProvider>
      </ShellChromeProvider>
      <Toaster richColors />
    </div>
  );
}
