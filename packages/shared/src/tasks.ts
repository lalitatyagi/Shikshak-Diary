import { z } from "zod";
import { taskTypeSchema } from "./enums.js";
import { isCalendarDateString, parseToKolkataCalendarDate } from "./dates.js";

/** YYYY-MM-DD calendar date (Asia/Kolkata). Also accepts ISO datetimes and normalizes. */
export const calendarDateSchema = z.string().transform((value, ctx) => {
  try {
    const normalized = parseToKolkataCalendarDate(value);
    if (!isCalendarDateString(normalized)) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        message: "Invalid calendar date",
      });
      return z.NEVER;
    }
    return normalized;
  } catch {
    ctx.addIssue({
      code: z.ZodIssueCode.custom,
      message: "Use YYYY-MM-DD (Asia/Kolkata calendar date)",
    });
    return z.NEVER;
  }
});

/** V1 create API only allows these two types. */
export const v1CreateTaskTypeSchema = z.enum([
  "DAILY_HOMEWORK",
  "NOTEBOOK_CHECK",
]);

export const createTaskBodySchema = z
  .object({
    subjectId: z.string().min(1),
    type: v1CreateTaskTypeSchema,
    title: z.string().trim().min(1).max(200),
    description: z.string().max(2000).optional().default(""),
    assignedOn: calendarDateSchema,
    dueOn: calendarDateSchema,
    maxMarks: z.number().optional().nullable(),
    totalParts: z.number().optional().nullable(),
  })
  .superRefine((data, ctx) => {
    if (data.maxMarks != null) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        path: ["maxMarks"],
        message: "maxMarks is only allowed for WEEKLY_TEST (V2)",
      });
    }
    if (data.totalParts != null) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        path: ["totalParts"],
        message: "totalParts is only allowed for HOLIDAY_HOMEWORK (V2)",
      });
    }

    if (data.dueOn < data.assignedOn) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        path: ["dueOn"],
        message: "dueOn must be on or after assignedOn",
      });
    }
  });

export const taskSchema = z.object({
  id: z.string().min(1),
  classId: z.string().min(1),
  subjectId: z.string().min(1),
  createdById: z.string().min(1),
  type: taskTypeSchema,
  title: z.string().min(1),
  description: z.string(),
  assignedOn: z.string().regex(/^\d{4}-\d{2}-\d{2}$/),
  dueOn: z.string().regex(/^\d{4}-\d{2}-\d{2}$/),
  maxMarks: z.number().int().nullable(),
  totalParts: z.number().int().nullable(),
  createdAt: z.string().datetime(),
  statusCount: z.number().int().nonnegative(),
});

export type CreateTaskBody = z.infer<typeof createTaskBodySchema>;
export type TaskDto = z.infer<typeof taskSchema>;
