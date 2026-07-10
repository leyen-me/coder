export type ShellOutletContext = {
  sidebarOpen: boolean;
  setSidebarOpen: (open: boolean) => void;
  /** Whether the floating title-bar search button is visible. */
  showFloatingSearch: boolean;
  /** Whether the floating title-bar back button is visible (desktop settings). */
  showFloatingBack: boolean;
};
