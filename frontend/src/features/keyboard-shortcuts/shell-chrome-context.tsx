import {
  createContext,
  useContext,
  type ReactNode,
} from "react";

type ShellChromeContextValue = {
  toggleSidebar: () => void;
};

const ShellChromeContext = createContext<ShellChromeContextValue | null>(null);

type ShellChromeProviderProps = {
  children: ReactNode;
  toggleSidebar: () => void;
};

export function ShellChromeProvider({
  children,
  toggleSidebar,
}: ShellChromeProviderProps) {
  return (
    <ShellChromeContext.Provider value={{ toggleSidebar }}>
      {children}
    </ShellChromeContext.Provider>
  );
}

export function useShellChrome(): ShellChromeContextValue {
  const context = useContext(ShellChromeContext);

  if (!context) {
    throw new Error("useShellChrome must be used within ShellChromeProvider");
  }

  return context;
}
