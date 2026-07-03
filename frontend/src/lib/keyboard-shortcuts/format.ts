import { isMacPlatform } from "./platform";
import { normalizeBinding } from "./match";

const KEY_DISPLAY_LABELS: Record<string, { mac: string; win: string }> = {
  mod: { mac: "⌘", win: "Ctrl" },
  ctrl: { mac: "⌃", win: "Ctrl" },
  shift: { mac: "⇧", win: "Shift" },
  alt: { mac: "⌥", win: "Alt" },
  enter: { mac: "↵", win: "Enter" },
  escape: { mac: "Esc", win: "Esc" },
  up: { mac: "↑", win: "↑" },
  down: { mac: "↓", win: "↓" },
  left: { mac: "←", win: "←" },
  right: { mac: "→", win: "→" },
  comma: { mac: ",", win: "," },
  backquote: { mac: "`", win: "`" },
  space: { mac: "Space", win: "Space" },
};

function formatKeyPart(part: string, isMac: boolean): string {
  const labels = KEY_DISPLAY_LABELS[part];
  if (labels) {
    return isMac ? labels.mac : labels.win;
  }

  if (part.length === 1) {
    return part.toUpperCase();
  }

  return part;
}

export function formatBindingParts(binding: string): string[] {
  const normalized = normalizeBinding(binding);
  if (!normalized) {
    return [];
  }

  const isMac = isMacPlatform();
  return normalized.split("+").map((part) => formatKeyPart(part, isMac));
}
