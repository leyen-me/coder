const WEEKDAY_ORDER = [1, 2, 3, 4, 5, 6, 0] as const;

const CRON_FIELD_RANGES = [
  { min: 0, max: 59 },
  { min: 0, max: 23 },
  { min: 1, max: 31 },
  { min: 1, max: 12 },
  { min: 0, max: 7, wrapSunday: true },
] as const;

export type SimpleSchedule =
  | {
      kind: "daily";
      time: string;
    }
  | {
      kind: "weekly";
      time: string;
      weekdays: number[];
    };

type ParsedCronSchedule = {
  minute: Set<number> | null;
  hour: Set<number> | null;
  dayOfMonth: Set<number> | null;
  month: Set<number> | null;
  weekday: Set<number> | null;
};

function normalizeWeekdayValue(value: number): number {
  return value === 7 ? 0 : value;
}

function isIntegerString(value: string): boolean {
  return /^\d+$/.test(value);
}

function parseNumericValue(
  value: string,
  min: number,
  max: number,
  wrapSunday = false
): number | null {
  if (!isIntegerString(value)) {
    return null;
  }
  const parsed = Number.parseInt(value, 10);
  if (!Number.isInteger(parsed) || parsed < min || parsed > max) {
    return null;
  }
  if (wrapSunday) {
    return normalizeWeekdayValue(parsed);
  }
  return parsed;
}

function parseCronField(
  field: string,
  min: number,
  max: number,
  wrapSunday = false
): Set<number> | null {
  if (!field) {
    return null;
  }
  if (field === "*") {
    return null;
  }

  const values = new Set<number>();
  const segments = field.split(",");
  for (const rawSegment of segments) {
    const segment = rawSegment.trim();
    if (!segment) {
      return null;
    }

    const [baseToken, stepToken] = segment.split("/");
    if (!baseToken) {
      return null;
    }

    let step = 1;
    if (stepToken !== undefined) {
      if (!isIntegerString(stepToken)) {
        return null;
      }
      step = Number.parseInt(stepToken, 10);
      if (!Number.isInteger(step) || step <= 0) {
        return null;
      }
    }

    let start = min;
    let end = max;

    if (baseToken !== "*") {
      const [startToken, endToken] = baseToken.split("-");
      const parsedStart = parseNumericValue(startToken, min, max, wrapSunday);
      if (parsedStart === null) {
        return null;
      }
      start = parsedStart;

      if (endToken !== undefined) {
        const parsedEnd = parseNumericValue(endToken, min, max, wrapSunday);
        if (parsedEnd === null) {
          return null;
        }
        end = parsedEnd;
      } else {
        end = parsedStart;
      }
    }

    if (start > end) {
      return null;
    }

    for (let current = start; current <= end; current += step) {
      values.add(wrapSunday ? normalizeWeekdayValue(current) : current);
    }
  }

  return values;
}

function normalizeCronParts(expression: string): string[] | null {
  const parts = expression.trim().split(/\s+/).filter(Boolean);
  if (parts.length === 6) {
    return parts.slice(1);
  }
  if (parts.length === 5) {
    return parts;
  }
  return null;
}

function normalizeWeekdayList(weekdays: readonly number[]): number[] {
  const values = Array.from(new Set(weekdays.map((value) => normalizeWeekdayValue(value))));
  return WEEKDAY_ORDER.filter((value) => values.includes(value));
}

export function normalizeCronExpression(expression: string): string | null {
  const parts = normalizeCronParts(expression);
  if (!parts) {
    return null;
  }

  for (let index = 0; index < parts.length; index += 1) {
    const range = CRON_FIELD_RANGES[index];
    const parsed = parseCronField(
      parts[index],
      range.min,
      range.max,
      "wrapSunday" in range && Boolean(range.wrapSunday)
    );
    if (parts[index] !== "*" && parsed === null) {
      return null;
    }
  }

  return parts.join(" ");
}

export function isValidCronExpression(expression: string): boolean {
  return normalizeCronExpression(expression) !== null;
}

function parseCronSchedule(expression: string): ParsedCronSchedule | null {
  const normalized = normalizeCronExpression(expression);
  if (!normalized) {
    return null;
  }

  const [minuteField, hourField, dayOfMonthField, monthField, weekdayField] =
    normalized.split(" ");

  const minute = minuteField === "*" ? null : parseCronField(minuteField, 0, 59);
  const hour = hourField === "*" ? null : parseCronField(hourField, 0, 23);
  const dayOfMonth =
    dayOfMonthField === "*" ? null : parseCronField(dayOfMonthField, 1, 31);
  const month = monthField === "*" ? null : parseCronField(monthField, 1, 12);
  const weekday =
    weekdayField === "*" ? null : parseCronField(weekdayField, 0, 7, true);

  if (
    (minuteField !== "*" && minute === null) ||
    (hourField !== "*" && hour === null) ||
    (dayOfMonthField !== "*" && dayOfMonth === null) ||
    (monthField !== "*" && month === null) ||
    (weekdayField !== "*" && weekday === null)
  ) {
    return null;
  }

  return { minute, hour, dayOfMonth, month, weekday };
}

function alignToMinute(timestampMs: number): number {
  return timestampMs - (timestampMs % 60_000);
}

function matchesField(field: Set<number> | null, value: number): boolean {
  return field === null || field.has(value);
}

function matchesSchedule(schedule: ParsedCronSchedule, timestampMs: number): boolean {
  const current = new Date(timestampMs);
  return (
    matchesField(schedule.minute, current.getUTCMinutes()) &&
    matchesField(schedule.hour, current.getUTCHours()) &&
    matchesField(schedule.dayOfMonth, current.getUTCDate()) &&
    matchesField(schedule.month, current.getUTCMonth() + 1) &&
    matchesField(schedule.weekday, current.getUTCDay())
  );
}

export function getNextCronOccurrenceAt(
  expression: string,
  fromTimestampMs: number
): number | null {
  const schedule = parseCronSchedule(expression);
  if (!schedule) {
    return null;
  }

  let candidate =
    fromTimestampMs % 60_000 === 0
      ? fromTimestampMs
      : alignToMinute(fromTimestampMs) + 60_000;

  const maxChecks = 366 * 24 * 60;
  for (let attempt = 0; attempt < maxChecks; attempt += 1) {
    if (matchesSchedule(schedule, candidate)) {
      return candidate;
    }
    candidate += 60_000;
  }

  return null;
}

function isValidTimeString(value: string): boolean {
  const match = /^(\d{2}):(\d{2})$/.exec(value);
  if (!match) {
    return false;
  }
  const hours = Number.parseInt(match[1], 10);
  const minutes = Number.parseInt(match[2], 10);
  return hours >= 0 && hours <= 23 && minutes >= 0 && minutes <= 59;
}

export function buildCronFromSimple(schedule: SimpleSchedule): string {
  if (!isValidTimeString(schedule.time)) {
    throw new Error(`Invalid schedule time: ${schedule.time}`);
  }

  const [hoursPart, minutesPart] = schedule.time.split(":");
  const minutes = Number.parseInt(minutesPart, 10);
  const hours = Number.parseInt(hoursPart, 10);

  if (schedule.kind === "daily") {
    return `${minutes} ${hours} * * *`;
  }

  const weekdays = normalizeWeekdayList(schedule.weekdays);
  if (weekdays.length === 0) {
    throw new Error("Weekly schedule requires at least one weekday");
  }

  return `${minutes} ${hours} * * ${weekdays.join(",")}`;
}

export function parseCronToSimple(expression: string): SimpleSchedule | null {
  const normalized = normalizeCronExpression(expression);
  if (!normalized) {
    return null;
  }

  const [minutesField, hoursField, dayOfMonthField, monthField, weekdayField] =
    normalized.split(" ");

  if (
    !isIntegerString(minutesField) ||
    !isIntegerString(hoursField) ||
    dayOfMonthField !== "*" ||
    monthField !== "*"
  ) {
    return null;
  }

  const minutes = Number.parseInt(minutesField, 10);
  const hours = Number.parseInt(hoursField, 10);
  const time = `${hours.toString().padStart(2, "0")}:${minutes
    .toString()
    .padStart(2, "0")}`;

  if (weekdayField === "*") {
    return { kind: "daily", time };
  }

  const weekdays = parseCronField(weekdayField, 0, 7, true);
  if (!weekdays || weekdays.size === 0) {
    return null;
  }

  return {
    kind: "weekly",
    time,
    weekdays: normalizeWeekdayList(Array.from(weekdays)),
  };
}
