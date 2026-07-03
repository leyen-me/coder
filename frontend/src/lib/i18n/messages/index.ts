import type { Locale } from "../types";
import type { MessageKey, Messages } from "../message-schema";
import { enMessages } from "./en";
import { zhMessages } from "./zh";

export const messagesByLocale: Record<Locale, Messages> = {
  zh: zhMessages,
  en: enMessages,
};

export type { MessageKey, Messages };
