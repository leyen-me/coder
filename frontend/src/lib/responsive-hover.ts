/** Reveal on hover for fine pointers; always visible on touch-first viewports. */
export const hoverRevealClassName =
  "opacity-100 transition-opacity md:opacity-0 md:group-hover:opacity-100 md:group-focus-within:opacity-100";

/** Hover-only hide; stays visible on touch-first viewports. */
export const hoverHideClassName =
  "md:transition-opacity md:group-hover:opacity-0";
