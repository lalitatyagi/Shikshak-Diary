import { z } from "zod";
import {
  addKolkataCalendarDays,
  isCalendarDateString,
  kolkataIsoWeekday,
} from "./dates.js";
import { taskTypeSchema } from "./enums.js";
import { calendarDateSchema, taskSchema } from "./tasks.js";

/** Cap so one tap cannot flood a class with months of columns. */
export const MAX_RECURRING_TASKS = 10;
export const MAX_RECURRING_SPAN_DAYS = 14;

/** Monday–Friday school week. */
export const WEEKDAY_SCHOOL_DAYS = [1, 2, 3, 4, 5] as const;
/** All seven days. */
export const ALL_WEEK_DAYS = [1, 2, 3, 4, 5, 6, 7] as const;

export const isoWeekdaySchema = z.number().int().min(1).max(7);

export const createRecurringTasksBodySchema = z
  .object({
    subjectId: z.string().min(1),
    type: taskTypeSchema,
    title: z.string().trim().min(1).max(200),
    description: z.string().max(2000).optional().default(""),
    fromDate: calendarDateSchema,
    toDate: calendarDateSchema,
    /** ISO weekdays to include (Mon=1 … Sun=7). */
    weekdays: z
      .array(isoWeekdaySchema)
      .min(1)
      .max(7)
      .default([...WEEKDAY_SCHOOL_DAYS]),
    maxMarks: z.number().int().min(1).max(1000).optional().nullable(),
    totalParts: z.number().int().min(1).max(100).optional().nullable(),
  })
  .superRefine((data, ctx) => {
    if (data.toDate < data.fromDate) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        path: ["toDate"],
        message: "toDate must be on or after fromDate",
      });
    }

    if (data.type === "WEEKLY_TEST") {
      if (data.maxMarks == null) {
        ctx.addIssue({
          code: z.ZodIssueCode.custom,
          path: ["maxMarks"],
          message: "maxMarks is required for WEEKLY_TEST",
        });
      }
      if (data.totalParts != null) {
        ctx.addIssue({
          code: z.ZodIssueCode.custom,
          path: ["totalParts"],
          message: "totalParts is only allowed for HOLIDAY_HOMEWORK",
        });
      }
    } else if (data.type === "HOLIDAY_HOMEWORK") {
      if (data.totalParts == null) {
        ctx.addIssue({
          code: z.ZodIssueCode.custom,
          path: ["totalParts"],
          message: "totalParts is required for HOLIDAY_HOMEWORK",
        });
      }
      if (data.maxMarks != null) {
        ctx.addIssue({
          code: z.ZodIssueCode.custom,
          path: ["maxMarks"],
          message: "maxMarks is only allowed for WEEKLY_TEST",
        });
      }
    } else {
      if (data.maxMarks != null) {
        ctx.addIssue({
          code: z.ZodIssueCode.custom,
          path: ["maxMarks"],
          message: "maxMarks is only allowed for WEEKLY_TEST",
        });
      }
      if (data.totalParts != null) {
        ctx.addIssue({
          code: z.ZodIssueCode.custom,
          path: ["totalParts"],
          message: "totalParts is only allowed for HOLIDAY_HOMEWORK",
        });
      }
    }

    let dates: string[];
    try {
      dates = expandRecurringDates(data.fromDate, data.toDate, data.weekdays);
    } catch {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        path: ["toDate"],
        message: `Date range cannot exceed ${MAX_RECURRING_SPAN_DAYS} calendar days`,
      });
      return;
    }
    if (dates.length === 0) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        path: ["weekdays"],
        message: "No matching days in this date range",
      });
    }
    if (dates.length > MAX_RECURRING_TASKS) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        path: ["toDate"],
        message: `At most ${MAX_RECURRING_TASKS} tasks per request — shorten the range`,
      });
    }
  });

export const createRecurringTasksResultSchema = z.object({
  created: z.array(taskSchema),
  /** Dates skipped because an identical task already existed. */
  skippedDates: z.array(z.string().regex(/^\d{4}-\d{2}-\d{2}$/)),
});

export type CreateRecurringTasksBody = z.infer<
  typeof createRecurringTasksBodySchema
>;
export type CreateRecurringTasksResult = z.infer<
  typeof createRecurringTasksResultSchema
>;

/** Seven Kolkata calendar days starting at fromDate (inclusive). */
export function repeatWindowDates(fromDate: string): string[] {
  if (!isCalendarDateString(fromDate)) {
    throw new Error("fromDate must be YYYY-MM-DD");
  }
  const dates: string[] = [];
  let cursor = fromDate;
  for (let step = 0; step < 7; step += 1) {
    dates.push(cursor);
    cursor = addKolkataCalendarDays(cursor, 1);
  }
  return dates;
}

/**
 * Dates a Mon–Fri or every-day repeat will create, matching the grid form:
 * the next 7 calendar days from fromDate, matching weekdays only.
 */
export function plannedRepeatDates(
  fromDate: string,
  pattern: "weekdays" | "daily",
): string[] {
  const window = repeatWindowDates(fromDate);
  const toDate = window[window.length - 1] ?? fromDate;
  const weekdays =
    pattern === "daily" ? [...ALL_WEEK_DAYS] : [...WEEKDAY_SCHOOL_DAYS];
  return expandRecurringDates(fromDate, toDate, weekdays);
}

/**
 * Inclusive date list in [fromDate, toDate] whose Kolkata weekday is in
 * `weekdays`. Throws if the span exceeds MAX_RECURRING_SPAN_DAYS calendar days.
 */
export function expandRecurringDates(
  fromDate: string,
  toDate: string,
  weekdays: number[],
): string[] {
  if (!isCalendarDateString(fromDate) || !isCalendarDateString(toDate)) {
    throw new Error("fromDate and toDate must be YYYY-MM-DD");
  }
  if (toDate < fromDate) {
    return [];
  }

  const allowed = new Set(weekdays);
  const dates: string[] = [];
  let cursor = fromDate;
  let steps = 0;
  while (cursor <= toDate) {
    if (allowed.has(kolkataIsoWeekday(cursor))) {
      dates.push(cursor);
    }
    cursor = addKolkataCalendarDays(cursor, 1);
    steps += 1;
    if (steps > MAX_RECURRING_SPAN_DAYS) {
      throw new Error(
        `Date range cannot exceed ${MAX_RECURRING_SPAN_DAYS} calendar days`,
      );
    }
  }
  return dates;
}
