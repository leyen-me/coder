/** Shared layout tokens for the desktop shell chrome. */
export const APP_SIDEBAR_WIDTH_PX = 260;

/** Width of the floating shell nav buttons (pl-2 + 2×icon-sm + gaps). */
export const FLOATING_SHELL_NAV_WIDTH_PX = 74;

const FLOATING_SHELL_NAV_PADDING_LEFT_PX = 8;
const FLOATING_SHELL_NAV_BUTTON_WIDTH_PX = 32;
const FLOATING_SHELL_NAV_BUTTON_GAP_PX = 2;

/** Reserve only the width actually occupied by floating shell nav buttons. */
export function getFloatingShellNavWidthPx(showSearch: boolean): number {
  const buttonCount = showSearch ? 2 : 1;
  return (
    FLOATING_SHELL_NAV_PADDING_LEFT_PX +
    buttonCount * FLOATING_SHELL_NAV_BUTTON_WIDTH_PX +
    (buttonCount - 1) * FLOATING_SHELL_NAV_BUTTON_GAP_PX
  );
}

export const TITLE_BAR_HEIGHT_CLASS = "h-11";

export const TITLE_BAR_CLASS = `${TITLE_BAR_HEIGHT_CLASS} shrink-0 select-none`;

export const WINDOW_CONTROL_BUTTON_WIDTH_CLASS = "w-[46px]";

export const TITLE_BAR_NAV_BUTTON_CLASS = "text-muted-foreground";
