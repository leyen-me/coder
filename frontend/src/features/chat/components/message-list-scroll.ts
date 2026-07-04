export const NEAR_BOTTOM_THRESHOLD_PX = 80;

export function getDistanceFromBottom(viewport: HTMLElement): number {
  return viewport.scrollHeight - viewport.scrollTop - viewport.clientHeight;
}

export function isNearBottom(
  viewport: HTMLElement,
  threshold = NEAR_BOTTOM_THRESHOLD_PX
): boolean {
  return getDistanceFromBottom(viewport) <= threshold;
}

export function shouldFollowStream({
  isPinnedToBottom,
  userJustSent,
}: {
  isPinnedToBottom: boolean;
  userJustSent: boolean;
}): boolean {
  return isPinnedToBottom || userJustSent;
}

export function isUserScrollUpIntent(deltaY: number): boolean {
  return deltaY < 0;
}

export function isUserScrollDownIntent(deltaY: number): boolean {
  return deltaY > 0;
}
