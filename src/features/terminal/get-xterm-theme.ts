import type { ITheme } from "@xterm/xterm";

import type { ResolvedTheme } from "@/lib/theme/types";

type AppThemeColors = {
  foreground: string;
  background: string;
  destructive: string;
  success: string;
  warning: string;
};

function withFallback(value: string, fallback: string): string {
  return value || fallback;
}

function readAppThemeColors(): AppThemeColors {
  if (typeof document === "undefined") {
    return {
      foreground: "",
      background: "",
      destructive: "",
      success: "",
      warning: "",
    };
  }

  const body = getComputedStyle(document.body);
  const probe = document.createElement("div");
  probe.style.display = "none";
  document.documentElement.appendChild(probe);

  const readVar = (variable: string, property: "color" | "backgroundColor") => {
    if (property === "backgroundColor") {
      probe.style.backgroundColor = `var(${variable})`;
    } else {
      probe.style.color = `var(${variable})`;
    }
    return getComputedStyle(probe)[property];
  };

  const colors = {
    foreground: body.color,
    background: body.backgroundColor,
    destructive: readVar("--destructive", "color"),
    success: readVar("--success", "color"),
    warning: readVar("--warning", "color"),
  };

  probe.remove();
  return colors;
}

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

/** Maps app theme tokens to an xterm.js theme. */
export function getXtermTheme(resolved: ResolvedTheme): ITheme {
  const palette = ANSI_PALETTE[resolved];
  const colors = readAppThemeColors();
  const foreground = withFallback(
    colors.foreground,
    resolved === "dark" ? "rgb(250, 250, 250)" : "rgb(10, 10, 10)"
  );
  const background = withFallback(
    colors.background,
    resolved === "dark" ? "rgb(10, 10, 10)" : "rgb(255, 255, 255)"
  );

  return {
    background,
    foreground,
    cursor: foreground,
    cursorAccent: background,
    selectionBackground:
      resolved === "dark" ? "rgba(255, 255, 255, 0.2)" : "rgba(0, 0, 0, 0.15)",
    selectionForeground: foreground,
    ...palette,
    red: withFallback(colors.destructive, palette.red!),
    green: withFallback(colors.success, palette.green!),
    yellow: withFallback(colors.warning, palette.yellow!),
  };
}
