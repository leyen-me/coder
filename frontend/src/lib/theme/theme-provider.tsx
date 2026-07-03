import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useState,
  type ReactNode,
} from "react";

import { applyTheme } from "./apply-theme";
import { getSystemPrefersDark } from "./get-system-prefers-dark";
import { readThemePreference, writeThemePreference } from "./storage";
import { resolveTheme } from "./resolve-theme";
import type { ResolvedTheme, ThemePreference } from "./types";

type ThemeContextValue = {
  preference: ThemePreference;
  resolved: ResolvedTheme;
  setPreference: (preference: ThemePreference) => void;
};

const ThemeContext = createContext<ThemeContextValue | null>(null);

function useSystemPrefersDark(): boolean {
  const [systemPrefersDark, setSystemPrefersDark] = useState(getSystemPrefersDark);

  useEffect(() => {
    const media = window.matchMedia("(prefers-color-scheme: dark)");

    const handleChange = (event: MediaQueryListEvent) => {
      setSystemPrefersDark(event.matches);
    };

    media.addEventListener("change", handleChange);
    return () => media.removeEventListener("change", handleChange);
  }, []);

  return systemPrefersDark;
}

type ThemeProviderProps = {
  children: ReactNode;
};

export function ThemeProvider({ children }: ThemeProviderProps) {
  const [preference, setPreferenceState] = useState<ThemePreference>(readThemePreference);
  const systemPrefersDark = useSystemPrefersDark();
  const resolved = resolveTheme(preference, systemPrefersDark);

  const setPreference = useCallback((nextPreference: ThemePreference) => {
    setPreferenceState(nextPreference);
    writeThemePreference(nextPreference);
  }, []);

  // Re-read preference when storage finishes loading from backend
  useEffect(() => {
    const handleStorageReady = () => {
      const saved = readThemePreference();
      if (saved !== preference) {
        setPreferenceState(saved);
      }
    };
    window.addEventListener("coder:storage-ready", handleStorageReady);
    return () => window.removeEventListener("coder:storage-ready", handleStorageReady);
  }, [preference]);

  useEffect(() => {
    applyTheme(resolved);
  }, [resolved]);

  const value = useMemo(
    () => ({
      preference,
      resolved,
      setPreference,
    }),
    [preference, resolved, setPreference]
  );

  return <ThemeContext.Provider value={value}>{children}</ThemeContext.Provider>;
}

export function useTheme(): ThemeContextValue {
  const context = useContext(ThemeContext);

  if (!context) {
    throw new Error("useTheme must be used within ThemeProvider");
  }

  return context;
}
