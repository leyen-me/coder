export type ShellOutletContext = {
  sidebarOpen: boolean;
  setSidebarOpen: (open: boolean) => void;
  /** Whether the floating shell nav shows the search button (settings hides it). */
  showSearch: boolean;
};
