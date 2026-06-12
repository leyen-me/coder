import { isMacPlatform } from "./platform";

const SPECIAL_KEY_ALIASES: Record<string, string> = {
  ",": "comma",
  "`": "backquote",
  " ": "space",
};

const NAMED_KEY_ALIASES: Record<string, string> = {
  arrowup: "up",
  arrowdown: "down",
  arrowleft: "left",
  arrowright: "right",
  esc: "escape",
  return: "enter",
};

type RequiredModifiers = {
  meta: boolean;
  ctrl: boolean;
  shift: boolean;
  alt: boolean;
};

export function normalizeBinding(binding: string): string {
  return binding
    .trim()
    .toLowerCase()
    .split("+")
    .map((part) => part.trim())
    .filter(Boolean)
    .join("+");
}

export function normalizeKeyFromEvent(event: KeyboardEvent): string {
  const rawKey = event.key.length === 1 ? event.key.toLowerCase() : event.key;
  const aliased = SPECIAL_KEY_ALIASES[rawKey] ?? rawKey.toLowerCase();
  return NAMED_KEY_ALIASES[aliased] ?? aliased;
}

function getRequiredModifiers(
  modifiers: string[],
  isMac: boolean
): RequiredModifiers {
  const wantsMod = modifiers.includes("mod");
  const wantsCtrl = modifiers.includes("ctrl");

  return {
    meta: isMac && wantsMod,
    ctrl: wantsCtrl || (!isMac && wantsMod),
    shift: modifiers.includes("shift"),
    alt: modifiers.includes("alt"),
  };
}

function modifiersMatch(
  event: KeyboardEvent,
  required: RequiredModifiers
): boolean {
  return (
    event.metaKey === required.meta &&
    event.ctrlKey === required.ctrl &&
    event.shiftKey === required.shift &&
    event.altKey === required.alt
  );
}

export function eventToBinding(event: KeyboardEvent): string | null {
  if (event.repeat) {
    return null;
  }

  const key = normalizeKeyFromEvent(event);
  if (
    key === "shift" ||
    key === "control" ||
    key === "alt" ||
    key === "meta" ||
    key === "mod"
  ) {
    return null;
  }

  const isMac = isMacPlatform();
  const parts: string[] = [];

  if (isMac ? event.metaKey : event.ctrlKey) {
    parts.push("mod");
  }
  if (event.ctrlKey && (isMac || !parts.includes("mod"))) {
    parts.push("ctrl");
  }
  if (event.altKey) {
    parts.push("alt");
  }
  if (event.shiftKey) {
    parts.push("shift");
  }

  parts.push(key);
  return normalizeBinding(parts.join("+"));
}

export function matchKeyboardEvent(
  event: KeyboardEvent,
  binding: string
): boolean {
  const normalized = normalizeBinding(binding);
  if (!normalized) {
    return false;
  }

  const parts = normalized.split("+");
  const key = parts[parts.length - 1] ?? "";
  const modifiers = parts.slice(0, -1);
  const required = getRequiredModifiers(modifiers, isMacPlatform());

  if (!modifiersMatch(event, required)) {
    return false;
  }

  return normalizeKeyFromEvent(event) === key;
}

export function bindingsConflict(a: string, b: string): boolean {
  const left = normalizeBinding(a);
  const right = normalizeBinding(b);
  return Boolean(left) && left === right;
}
