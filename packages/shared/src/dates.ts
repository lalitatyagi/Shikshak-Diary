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

/** True when the task's due calendar day is before today's Kolkata date. */
export function isPastDueInKolkata(
  dueOn: Date,
  now: Date = new Date(),
): boolean {
  return toKolkataCalendarDate(dueOn) < toKolkataCalendarDate(now);
}
