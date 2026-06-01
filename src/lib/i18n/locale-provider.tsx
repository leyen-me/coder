import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useState,
  type ReactNode,
} from "react";

import { applyLocale } from "./apply-locale";
import { createTranslator } from "./create-translator";
import type { MessageKey, Messages } from "./messages";
import { messagesByLocale } from "./messages";
import { readLocale, writeLocale } from "./storage";
import type { Locale } from "./types";

type TranslateFn = (
  key: MessageKey,
  params?: Record<string, string | number>
) => string;

type LocaleContextValue = {
  locale: Locale;
  messages: Messages;
  setLocale: (locale: Locale) => void;
  t: TranslateFn;
};

const LocaleContext = createContext<LocaleContextValue | null>(null);

type LocaleProviderProps = {
  children: ReactNode;
};

export function LocaleProvider({ children }: LocaleProviderProps) {
  const [locale, setLocaleState] = useState<Locale>(readLocale);
  const messages = messagesByLocale[locale];
  const t = useMemo(() => createTranslator(messages), [messages]);

  const setLocale = useCallback((nextLocale: Locale) => {
    setLocaleState(nextLocale);
    writeLocale(nextLocale);
  }, []);

  useEffect(() => {
    applyLocale(locale);
  }, [locale]);

  const value = useMemo(
    () => ({
      locale,
      messages,
      setLocale,
      t,
    }),
    [locale, messages, setLocale, t]
  );

  return (
    <LocaleContext.Provider value={value}>{children}</LocaleContext.Provider>
  );
}

export function useLocale(): LocaleContextValue {
  const context = useContext(LocaleContext);

  if (!context) {
    throw new Error("useLocale must be used within LocaleProvider");
  }

  return context;
}

export function useTranslation(): Pick<LocaleContextValue, "t"> {
  return { t: useLocale().t };
}
