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
});

export const homeResponseSchema = z.object({
  /** Kolkata calendar date for "today". */
  today: z.string().regex(/^\d{4}-\d{2}-\d{2}$/),
  defaultersDays: z.number().int().positive().default(DEFAULT_DEFAULTERS_DAYS),
  classes: z.array(homeClassCardSchema),
});

export type HomeTodayTask = z.infer<typeof homeTodayTaskSchema>;
export type HomeClassCard = z.infer<typeof homeClassCardSchema>;
export type HomeResponse = z.infer<typeof homeResponseSchema>;
