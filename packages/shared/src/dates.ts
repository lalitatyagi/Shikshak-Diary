/** App calendar timezone for task dates and defaulter windows. */
export const APP_TIMEZONE = "Asia/Kolkata";

const CALENDAR_DATE_RE = /^\d{4}-\d{2}-\d{2}$/;

export function isCalendarDateString(value: string): boolean {
  return CALENDAR_DATE_RE.test(value);
}

/**
 * Formats an instant as YYYY-MM-DD in Asia/Kolkata.
 * Uses en-CA so the result is always year-month-day ordered.
 */
export function toKolkataCalendarDate(instant: Date): string {
  return new Intl.DateTimeFormat("en-CA", {
    timeZone: APP_TIMEZONE,
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  }).format(instant);
}

/**
 * Interprets YYYY-MM-DD as that calendar day in Asia/Kolkata (midnight IST).
 * Stored as a UTC instant: 2026-10-03 → 2026-10-02T18:30:00.000Z.
 */
export function kolkataCalendarDateToInstant(dateStr: string): Date {
  if (!isCalendarDateString(dateStr)) {
    throw new Error(`Expected YYYY-MM-DD, got: ${dateStr}`);
  }
  return new Date(`${dateStr}T00:00:00+05:30`);
}

/**
 * Accepts YYYY-MM-DD, or an ISO datetime (uses the Kolkata calendar day).
 */
export function parseToKolkataCalendarDate(input: string): string {
  const trimmed = input.trim();
  if (isCalendarDateString(trimmed)) {
    return trimmed;
  }

  const ms = Date.parse(trimmed);
  if (Number.isNaN(ms)) {
    throw new Error(`Invalid date: ${input}`);
  }
  return toKolkataCalendarDate(new Date(ms));
}

export function startOfTodayKolkata(now: Date = new Date()): Date {
  return kolkataCalendarDateToInstant(toKolkataCalendarDate(now));
}

/**
 * Shift a Kolkata calendar date by whole days.
 * Safe for Asia/Kolkata (no DST): midnight IST + 24h is the next calendar day.
 */
export function addKolkataCalendarDays(dateStr: string, days: number): string {
  const instant = kolkataCalendarDateToInstant(dateStr);
  const shifted = new Date(instant.getTime() + days * 24 * 60 * 60 * 1000);
  return toKolkataCalendarDate(shifted);
}

/**
 * Inclusive window of the last `days` Kolkata calendar days ending today.
 * days=7 → fromDate is 6 days before toDate.
 */
export function defaultersWindow(
  days: number,
  now: Date = new Date(),
): { fromDate: string; toDate: string } {
  if (!Number.isInteger(days) || days < 1) {
    throw new Error(`days must be a positive integer, got: ${days}`);
  }
  const toDate = toKolkataCalendarDate(now);
  const fromDate = addKolkataCalendarDays(toDate, -(days - 1));
  return { fromDate, toDate };
}

/** True when the task's due calendar day is before today's Kolkata date. */
export function isPastDueInKolkata(
  dueOn: Date,
  now: Date = new Date(),
): boolean {
  return toKolkataCalendarDate(dueOn) < toKolkataCalendarDate(now);
}

const WEEKDAY_SHORT = ["Mon", "Tue", "Wed", "Thu", "Fri", "Sat", "Sun"] as const;
const WEEKDAY_LONG = [
  "Monday",
  "Tuesday",
  "Wednesday",
  "Thursday",
  "Friday",
  "Saturday",
  "Sunday",
] as const;
const MONTH_SHORT = [
  "Jan",
  "Feb",
  "Mar",
  "Apr",
  "May",
  "Jun",
  "Jul",
  "Aug",
  "Sep",
  "Oct",
  "Nov",
  "Dec",
] as const;

export type KolkataDayLabel = {
  date: string;
  /** Monday=1 … Sunday=7. */
  weekdayIndex: number;
  weekdayShort: string;
  weekdayLong: string;
  dayOfMonth: number;
  monthShort: string;
  /** e.g. "Wed 28 Oct" — day before month, so it cannot be read as MM/DD. */
  label: string;
  /** e.g. "Wednesday, 28 Oct 2026". */
  longLabel: string;
};

/**
 * Labels a YYYY-MM-DD Kolkata calendar date without going through the
 * browser locale (which may show 10/28/2026 or 28-10-2026).
 */
export function describeKolkataDay(dateStr: string): KolkataDayLabel {
  if (!isCalendarDateString(dateStr)) {
    throw new Error(`Expected YYYY-MM-DD, got: ${dateStr}`);
  }
  const monthIndex = Number(dateStr.slice(5, 7));
  const dayOfMonth = Number(dateStr.slice(8, 10));
  const monthShort = MONTH_SHORT[monthIndex - 1];
  if (!monthShort || dayOfMonth < 1 || dayOfMonth > 31) {
    throw new Error(`Expected YYYY-MM-DD, got: ${dateStr}`);
  }
  const weekdayIndex = kolkataIsoWeekday(dateStr);
  const weekdayShort = WEEKDAY_SHORT[weekdayIndex - 1] ?? "Day";
  const weekdayLong = WEEKDAY_LONG[weekdayIndex - 1] ?? "Day";
  const year = dateStr.slice(0, 4);
  return {
    date: dateStr,
    weekdayIndex,
    weekdayShort,
    weekdayLong,
    dayOfMonth,
    monthShort,
    label: `${weekdayShort} ${dayOfMonth} ${monthShort}`,
    longLabel: `${weekdayLong}, ${dayOfMonth} ${monthShort} ${year}`,
  };
}

/** ISO weekday in Asia/Kolkata: Monday=1 … Sunday=7. */
export function kolkataIsoWeekday(dateStr: string): number {
  const short = new Intl.DateTimeFormat("en-US", {
    timeZone: APP_TIMEZONE,
    weekday: "short",
  }).format(kolkataCalendarDateToInstant(dateStr));
  const map: Record<string, number> = {
    Mon: 1,
    Tue: 2,
    Wed: 3,
    Thu: 4,
    Fri: 5,
    Sat: 6,
    Sun: 7,
  };
  const day = map[short];
  if (day == null) {
    throw new Error(`Unexpected weekday label: ${short}`);
  }
  return day;
}
