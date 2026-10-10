import { z } from "zod";
import { taskTypeSchema, type TaskType } from "./enums.js";
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

/** @deprecated Use taskTypeSchema — all four types are creatable in V2. */
export const v1CreateTaskTypeSchema = z.enum([
  "DAILY_HOMEWORK",
  "NOTEBOOK_CHECK",
]);

export const createTaskBodySchema = z
  .object({
    subjectId: z.string().min(1),
    type: taskTypeSchema,
    title: z.string().trim().min(1).max(200),
    description: z.string().max(2000).optional().default(""),
    assignedOn: calendarDateSchema,
    dueOn: calendarDateSchema,
    maxMarks: z.number().int().min(1).max(1000).optional().nullable(),
    totalParts: z.number().int().min(1).max(100).optional().nullable(),
  })
  .superRefine((data, ctx) => {
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

/**
 * Type-specific marks / partsDone rules from the product data model.
 * Returns an error message, or null when valid.
 */
export function validateMarksAndParts(input: {
  type: TaskType;
  maxMarks: number | null;
  totalParts: number | null;
  marks?: number | null;
  partsDone?: number | null;
}): string | null {
  const marks = input.marks;
  const partsDone = input.partsDone;

  if (input.type === "WEEKLY_TEST") {
    if (partsDone != null) {
      return "partsDone is only allowed for HOLIDAY_HOMEWORK";
    }
    if (marks != null) {
      if (!Number.isInteger(marks) || marks < 0) {
        return "marks must be a non-negative integer";
      }
      if (input.maxMarks == null || marks > input.maxMarks) {
        return `marks must be between 0 and ${input.maxMarks ?? 0}`;
      }
    }
    return null;
  }

  if (input.type === "HOLIDAY_HOMEWORK") {
    if (marks != null) {
      return "marks is only allowed for WEEKLY_TEST";
    }
    if (partsDone != null) {
      if (!Number.isInteger(partsDone) || partsDone < 0) {
        return "partsDone must be a non-negative integer";
      }
      if (input.totalParts == null || partsDone > input.totalParts) {
        return `partsDone must be between 0 and ${input.totalParts ?? 0}`;
      }
    }
    return null;
  }

  if (marks != null) {
    return "marks is only allowed for WEEKLY_TEST";
  }
  if (partsDone != null) {
    return "partsDone is only allowed for HOLIDAY_HOMEWORK";
  }
  return null;
}

export type CreateTaskBody = z.infer<typeof createTaskBodySchema>;
export type TaskDto = z.infer<typeof taskSchema>;
