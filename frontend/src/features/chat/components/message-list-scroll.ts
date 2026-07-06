export const NEAR_BOTTOM_THRESHOLD_PX = 80;
export const CHAT_SCROLL_TO_BOTTOM_EVENT = "chat:scroll-to-bottom";
/** Matches session message DB refresh debounce in use-session-messages. */
export const CHAT_SCROLL_RETRY_MS = 200;

export function requestMessageListScrollToBottom() {
  window.dispatchEvent(new CustomEvent(CHAT_SCROLL_TO_BOTTOM_EVENT));
}

export function getDistanceFromBottom(viewport: HTMLElement): number {
  return viewport.scrollHeight - viewport.scrollTop - viewport.clientHeight;
}

export function isNearBottom(
  viewport: HTMLElement,
  threshold = NEAR_BOTTOM_THRESHOLD_PX
): boolean {
  return getDistanceFromBottom(viewport) <= threshold;
}

export function didAppendUserMessage(
  messages: readonly { role: string }[],
  previousCount: number
): boolean {
  if (messages.length <= previousCount) {
    return false;
  }

  return messages
    .slice(previousCount)
    .some((message) => message.role === "user");
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

export function shouldClearScrollPinSuppression(
  distanceFromBottom: number,
  threshold = NEAR_BOTTOM_THRESHOLD_PX
): boolean {
  return distanceFromBottom <= threshold;
}

export function isUserScrollUpIntent(deltaY: number): boolean {
  return deltaY < 0;
}

export function isUserScrollDownIntent(deltaY: number): boolean {
  return deltaY > 0;
}
