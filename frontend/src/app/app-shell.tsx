import { Outlet, useLocation, useNavigate, useNavigationType } from "react-router-dom";
import { useCallback, useEffect, useState } from "react";

import { FloatingShellNav } from "@/components/layout/floating-shell-nav";
import { ErrorBoundary } from "@/components/error-boundary";
import { useSearchDialog } from "@/features/keyboard-shortcuts/search-dialog-context";
import { useSidebarOpen } from "@/features/chat/hooks/use-sidebar-open";
import { paths } from "@/app/paths";
import { HotkeyActionsProvider } from "@/features/keyboard-shortcuts/hotkey-actions-context";
import { KeyboardShortcuts } from "@/features/keyboard-shortcuts/keyboard-shortcuts";
import { SearchDialogProvider } from "@/features/keyboard-shortcuts/search-dialog-context";
import { ShellChromeProvider } from "@/features/keyboard-shortcuts/shell-chrome-context";
import { Toaster } from "@/components/ui/sonner";
import { useIsMobile } from "@/hooks/use-mobile";
import { useAppWindow } from "@/lib/tauri/use-app-window";
import { useWindowMaximized } from "@/lib/tauri/use-window-maximized";
import { cn } from "@/lib/utils";
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
  showBack,
  onBack,
  canGoBack,
}: {
  isSidebarOpen: boolean;
  toggleSidebar: () => void;
  showSearch: boolean;
  showBack: boolean;
  onBack: () => void;
  canGoBack: boolean;
}) {
  const { open: openSearch } = useSearchDialog();
  return (
    <FloatingShellNav
      isSidebarOpen={isSidebarOpen}
      onToggleSidebar={toggleSidebar}
      onSearch={openSearch}
      showSearch={showSearch}
      showBack={showBack}
      onBack={onBack}
      canGoBack={canGoBack}
    />
  );
}

function getHistoryIdx(): number {
  return (window.history.state as { idx?: number } | null)?.idx ?? -1;
}

export function AppShell() {
  const { isOpen: isSidebarOpen, toggle: toggleSidebar, setOpen: setSidebarOpen } =
    useSidebarOpen();
  const isMobile = useIsMobile();
  const location = useLocation();
  const navigate = useNavigate();
  const navigationType = useNavigationType();
  const appWindow = useAppWindow();
  const isMaximized = useWindowMaximized(appWindow);
  const useRoundedShell = appWindow !== null && !isMaximized;
  const isDesktopShell = appWindow !== null;
  const isSettingsRoute = location.pathname === paths.settings;
  const showFloatingSearch = !isSettingsRoute;
  // Desktop has no browser chrome; settings needs an explicit back control.
  const showFloatingBack = isDesktopShell && isSettingsRoute;
  const [canGoBack, setCanGoBack] = useState(() => getHistoryIdx() > 0);

  const handleBack = useCallback(() => {
    if (getHistoryIdx() > 0) {
      navigate(-1);
      return;
    }
    navigate(paths.home);
  }, [navigate]);

  useEffect(() => {
    setCanGoBack(getHistoryIdx() > 0);
  }, [navigationType, location.key]);

  const shellContext: ShellOutletContext = {
    sidebarOpen: isSidebarOpen,
    setSidebarOpen,
    showFloatingSearch,
    showFloatingBack,
  };

  // Close overlay sidebar after navigation on mobile.
  useEffect(() => {
    if (isMobile) {
      setSidebarOpen(false);
    }
  }, [isMobile, location.pathname, setSidebarOpen]);

  return (
    <div
      className={cn(
        "relative flex h-svh flex-row overflow-hidden bg-background",
        useRoundedShell && "rounded-(--window-radius)",
      )}
    >
      <ShellChromeProvider toggleSidebar={toggleSidebar}>
        <SearchDialogProvider>
          <ShellFloatingNav
            isSidebarOpen={isSidebarOpen}
            toggleSidebar={toggleSidebar}
            showSearch={showFloatingSearch}
            showBack={showFloatingBack}
            onBack={handleBack}
            canGoBack={canGoBack || showFloatingBack}
          />
          <HotkeyActionsProvider>
            <div className="flex min-h-0 min-w-0 flex-1 flex-row overflow-hidden">
              <ErrorBoundary
                className="flex min-h-0 min-w-0 flex-1 items-center justify-center bg-background px-4 py-6 md:px-6 md:py-8"
                title="Workspace failed to render"
                description="This section hit a rendering error. Retry the view or reload the app to recover."
              >
                <Outlet context={shellContext} />
              </ErrorBoundary>
            </div>
            <KeyboardShortcuts />
          </HotkeyActionsProvider>
        </SearchDialogProvider>
      </ShellChromeProvider>
      <Toaster richColors />
    </div>
  );
}
