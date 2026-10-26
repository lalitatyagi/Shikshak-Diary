import { z } from "zod";
import { taskTypeSchema } from "./enums.js";
import { DEFAULT_DEFAULTERS_DAYS } from "./defaulters.js";

export const homeTodayTaskSchema = z.object({
  id: z.string().min(1),
  title: z.string().min(1),
  type: taskTypeSchema,
  total: z.number().int().nonnegative(),
  pendingCount: z.number().int().nonnegative(),
});

export const homeTopDefaulterSchema = z.object({
  studentId: z.string().min(1),
  name: z.string().min(1),
  rollNumber: z.number().int().positive(),
  missCount: z.number().int().positive(),
});

export const homeClassCardSchema = z.object({
  id: z.string().min(1),
  schoolId: z.string().min(1),
  name: z.string().min(1),
  academicYear: z.string().min(1),
  studentCount: z.number().int().nonnegative(),
  todayTasks: z.array(homeTodayTaskSchema),
  /** Sum of PENDING statuses across today's tasks. */
  pendingTodayCount: z.number().int().nonnegative(),
  defaulterCount: z.number().int().nonnegative(),
  /**
   * Present % among marked attendance rows in the lookback window.
   * Null when no attendance was marked.
   */
  attendancePresentPct: z.number().int().min(0).max(100).nullable(),
  /**
   * Done % among scored daily-homework rows (DONE / DONE+NOT_DONE+INCOMPLETE).
   * Null when nothing was scored.
   */
  homeworkDonePct: z.number().int().min(0).max(100).nullable(),
  /** Worst miss counts in the window (max 3). */
  topDefaulters: z.array(homeTopDefaulterSchema).max(3),
});

export const homeResponseSchema = z.object({
  /** Kolkata calendar date for "today". */
  today: z.string().regex(/^\d{4}-\d{2}-\d{2}$/),
  defaultersDays: z.number().int().positive().default(DEFAULT_DEFAULTERS_DAYS),
  classes: z.array(homeClassCardSchema),
});

/** Rounded percent, or null when there is no denominator. */
export function percentOrNull(part: number, whole: number): number | null {
  if (!Number.isFinite(part) || !Number.isFinite(whole) || whole <= 0) {
    return null;
  }
  return Math.round((100 * part) / whole);
}

export type HomeTodayTask = z.infer<typeof homeTodayTaskSchema>;
export type HomeTopDefaulter = z.infer<typeof homeTopDefaulterSchema>;
export type HomeClassCard = z.infer<typeof homeClassCardSchema>;
export type HomeResponse = z.infer<typeof homeResponseSchema>;
