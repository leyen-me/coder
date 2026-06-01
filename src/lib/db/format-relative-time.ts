const MINUTE_MS = 60_000;
const HOUR_MS = 3_600_000;
const DAY_MS = 86_400_000;

type RelativeTimeLabels = {
  justNow: string;
  minutesAgo: (count: number) => string;
  hoursAgo: (count: number) => string;
  daysAgo: (count: number) => string;
  weeksAgo: (count: number) => string;
  monthsAgo: (count: number) => string;
};

export function formatRelativeTime(
  timestamp: number,
  now = Date.now(),
  labels: RelativeTimeLabels
): string {
  const diff = Math.max(0, now - timestamp);

  if (diff < MINUTE_MS) {
    return labels.justNow;
  }

  if (diff < HOUR_MS) {
    const minutes = Math.floor(diff / MINUTE_MS);
    return labels.minutesAgo(minutes);
  }

  if (diff < DAY_MS) {
    const hours = Math.floor(diff / HOUR_MS);
    return labels.hoursAgo(hours);
  }

  if (diff < DAY_MS * 7) {
    const days = Math.floor(diff / DAY_MS);
    return labels.daysAgo(days);
  }

  if (diff < DAY_MS * 30) {
    const weeks = Math.floor(diff / (DAY_MS * 7));
    return labels.weeksAgo(weeks);
  }

  const months = Math.floor(diff / (DAY_MS * 30));
  return labels.monthsAgo(Math.max(1, months));
}
