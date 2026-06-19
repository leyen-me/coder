import type { ITheme } from "@xterm/xterm";

import type { ResolvedTheme } from "@/lib/theme/types";

const LIGHT_FOREGROUND = "#1f1f1f";
const LIGHT_BACKGROUND = "#ffffff";
const DARK_FOREGROUND = "#f0f0f0";
const DARK_BACKGROUND = "#0a0a0a";

const ANSI_PALETTE: Record<
  ResolvedTheme,
  Pick<
    ITheme,
    | "black"
    | "red"
    | "green"
    | "yellow"
    | "blue"
    | "magenta"
    | "cyan"
    | "white"
    | "brightBlack"
    | "brightRed"
    | "brightGreen"
    | "brightYellow"
    | "brightBlue"
    | "brightMagenta"
    | "brightCyan"
    | "brightWhite"
  >
> = {
  light: {
    black: "#383838",
    red: "#c42b1c",
    green: "#16a34a",
    yellow: "#d97706",
    blue: "#0969da",
    magenta: "#8250df",
    cyan: "#1f7a8c",
    white: "#e8e8e8",
    brightBlack: "#57606a",
    brightRed: "#a40e26",
    brightGreen: "#116329",
    brightYellow: "#633c01",
    brightBlue: "#0550ae",
    brightMagenta: "#5928a7",
    brightCyan: "#0969da",
    brightWhite: "#ffffff",
  },
  dark: {
    black: "#484848",
    red: "#ff6b6b",
    green: "#56d364",
    yellow: "#f2cc60",
    blue: "#79c0ff",
    magenta: "#d2a8ff",
    cyan: "#56d4dd",
    white: "#b1bac4",
    brightBlack: "#6e7681",
    brightRed: "#ffa198",
    brightGreen: "#7ee787",
    brightYellow: "#f9e06a",
    brightBlue: "#91cbff",
    brightMagenta: "#e2b0ff",
    brightCyan: "#7ee8e8",
    brightWhite: "#ffffff",
  },
};

/** Maps the app's resolved theme to an xterm.js ITheme. */
export function getXtermTheme(resolved: ResolvedTheme): ITheme {
  const palette = ANSI_PALETTE[resolved];
  const isDark = resolved === "dark";

  return {
    background: isDark ? DARK_BACKGROUND : LIGHT_BACKGROUND,
    foreground: isDark ? DARK_FOREGROUND : LIGHT_FOREGROUND,
    cursor: isDark ? DARK_FOREGROUND : LIGHT_FOREGROUND,
    cursorAccent: isDark ? DARK_BACKGROUND : LIGHT_BACKGROUND,
    selectionBackground: isDark
      ? "rgba(255, 255, 255, 0.2)"
      : "rgba(0, 0, 0, 0.15)",
    selectionForeground: isDark ? DARK_FOREGROUND : LIGHT_FOREGROUND,
    ...palette,
    red: palette.red!,
    green: palette.green!,
    yellow: palette.yellow!,
  };
}
