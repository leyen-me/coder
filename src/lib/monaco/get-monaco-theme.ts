import type { editor } from "monaco-editor";

import type { ResolvedTheme } from "@/lib/theme/types";

type MonacoThemeColors = {
  background: string;
  foreground: string;
  mutedForeground: string;
  border: string;
  selectionBackground: string;
  inactiveSelectionBackground: string;
  selectionHighlightBackground: string;
};

const FALLBACK_COLORS: Record<ResolvedTheme, MonacoThemeColors> = {
  light: {
    background: "#ffffff",
    foreground: "#0a0a0a",
    mutedForeground: "#737373",
    border: "#e5e5e5",
    selectionBackground: "#ADD6FF",
    inactiveSelectionBackground: "#E5EBF1",
    selectionHighlightBackground: "#ADD6FF66",
  },
  dark: {
    background: "#0a0a0a",
    foreground: "#fafafa",
    mutedForeground: "#a3a3a3",
    border: "rgba(255, 255, 255, 0.1)",
    selectionBackground: "#264F78",
    inactiveSelectionBackground: "#3A3D41",
    selectionHighlightBackground: "#264F784D",
  },
};

let colorCanvas: CanvasRenderingContext2D | null = null;

/** Monaco only accepts #hex and rgb()/rgba() — not oklch() from computed styles. */
function toMonacoColor(color: string, fallback: string): string {
  if (!color || color === "transparent") {
    return fallback;
  }

  if (
    color.startsWith("#") ||
    color.startsWith("rgb(") ||
    color.startsWith("rgba(")
  ) {
    return color;
  }

  try {
    if (!colorCanvas) {
      colorCanvas = document.createElement("canvas").getContext("2d");
    }

    if (!colorCanvas) {
      return fallback;
    }

    colorCanvas.fillStyle = fallback;
    colorCanvas.fillStyle = color;
    const normalized = colorCanvas.fillStyle;

    if (
      normalized.startsWith("#") ||
      normalized.startsWith("rgb(") ||
      normalized.startsWith("rgba(")
    ) {
      return normalized;
    }
  } catch {
    // Fall through to fallback.
  }

  return fallback;
}

function readCssVariable(variable: string, property: "color" | "backgroundColor"): string {
  const probe = document.createElement("div");
  probe.style.display = "none";
  document.documentElement.appendChild(probe);

  if (property === "backgroundColor") {
    probe.style.backgroundColor = `var(${variable})`;
  } else {
    probe.style.color = `var(${variable})`;
  }

  const value = getComputedStyle(probe)[property];
  probe.remove();
  return value;
}

function readMonacoThemeColors(resolved: ResolvedTheme): MonacoThemeColors {
  const fallback = FALLBACK_COLORS[resolved];

  if (typeof document === "undefined") {
    return fallback;
  }

  const body = getComputedStyle(document.body);

  return {
    background: toMonacoColor(body.backgroundColor, fallback.background),
    foreground: toMonacoColor(body.color, fallback.foreground),
    mutedForeground: toMonacoColor(
      readCssVariable("--muted-foreground", "color"),
      fallback.mutedForeground
    ),
    border: toMonacoColor(readCssVariable("--border", "color"), fallback.border),
    selectionBackground: fallback.selectionBackground,
    inactiveSelectionBackground: fallback.inactiveSelectionBackground,
    selectionHighlightBackground: fallback.selectionHighlightBackground,
  };
}

export function getMonacoThemeName(resolved: ResolvedTheme): string {
  return resolved === "dark" ? "coder-dark" : "coder-light";
}

/** Maps app theme tokens to a Monaco editor theme. */
export function defineMonacoTheme(
  monaco: typeof import("monaco-editor"),
  resolved: ResolvedTheme
): string {
  const themeName = getMonacoThemeName(resolved);
  const colors = readMonacoThemeColors(resolved);

  monaco.editor.defineTheme(themeName, {
    base: resolved === "dark" ? "vs-dark" : "vs",
    inherit: true,
    rules: [],
    colors: {
      "editor.background": colors.background,
      "editor.foreground": colors.foreground,
      "editorLineNumber.foreground": colors.mutedForeground,
      "editorLineNumber.activeForeground": colors.foreground,
      "editorCursor.foreground": colors.foreground,
      "editor.selectionBackground": colors.selectionBackground,
      "editor.inactiveSelectionBackground": colors.inactiveSelectionBackground,
      "editor.selectionHighlightBackground": colors.selectionHighlightBackground,
      "editorWidget.background": colors.background,
      "editorWidget.border": colors.border,
      "editorOverviewRuler.border": colors.border,
    } satisfies editor.IStandaloneThemeData["colors"],
  });

  return themeName;
}
